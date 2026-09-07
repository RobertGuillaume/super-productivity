import { DestroyRef, inject, Injectable } from '@angular/core';
import type {
  ContainerListing,
  DiscoveryStatus,
  RuntimeLayout,
  Unsubscribe,
} from '@solid-intents/runtime';
import { Log } from '../core/log';
import { isSolidDataLayerPrimaryEnabled } from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';

const REFRESH_BATCH_SIZE = 10;
const MAX_DISCOVERY_CONTINUATIONS = 100;
const PRIORITY_CONTAINER_KEYS = ['tasks', 'projects', 'tags', 'app', 'config'] as const;

/** Coordinates all network-backed Solid catalog refresh work for the application. */
@Injectable({ providedIn: 'root' })
export class SolidPodRefreshCoordinatorService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dataLayerState = inject(SolidDataLayerStateService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly hydration = inject(SolidTaskHydrationService);

  private startPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private reconciliationTail: Promise<void> = Promise.resolve();
  private reconciliationTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions: Unsubscribe[] = [];
  private knownContainers = new Set<string>();
  private started = false;
  private firstRefreshedEntityLogged = false;

  constructor() {
    const handleOnline = (): void => {
      if (this.started) {
        void this.refreshNow();
      }
    };
    window.addEventListener('online', handleOnline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', handleOnline);
      this.stopSubscriptions();
      if (this.reconciliationTimer !== null) {
        clearTimeout(this.reconciliationTimer);
      }
    });
  }

  start(): Promise<void> {
    if (this.started) {
      return this.refreshPromise ?? Promise.resolve();
    }
    if (this.startPromise !== null) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  refreshNow(): Promise<void> {
    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }
    if (!isSolidDataLayerPrimaryEnabled()) {
      this.dataLayerState.setPhase('disabled');
      return Promise.resolve();
    }
    if (this.solidRuntime.client.auth.state().status !== 'authenticated') {
      this.dataLayerState.setPhase('sign-in-required');
      return Promise.resolve();
    }

    this.refreshPromise = this.refreshCatalog(false).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async startInternal(): Promise<void> {
    if (!isSolidDataLayerPrimaryEnabled()) {
      this.dataLayerState.setPhase('disabled');
      return;
    }
    if (this.solidRuntime.client.auth.state().status !== 'authenticated') {
      this.dataLayerState.setPhase('sign-in-required');
      return;
    }

    let rootUnavailable = false;
    try {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      rootUnavailable = resolution === 'unavailable';
      if (resolution === 'changed') {
        this.stopSubscriptions();
        this.knownContainers.clear();
        await this.hydration.reconcileStore();
      }
    } catch (error) {
      rootUnavailable = true;
      this.dataLayerState.addDiagnostics();
      Log.err('Solid storage root activation failed', safeError('root-discovery', error));
    }

    this.installSubscriptions();
    this.started = true;
    this.refreshPromise = this.refreshCatalog(rootUnavailable).finally(() => {
      this.refreshPromise = null;
    });
    await this.refreshPromise;
  }

  private async refreshCatalog(initiallyDegraded: boolean): Promise<void> {
    const startedAt = performance.now();
    const containers = orderedContainers(this.solidRuntime.ensureLayout());
    let isDegraded = initiallyDegraded;

    this.dataLayerState.setRefreshProgress({
      completedContainers: 0,
      totalContainers: containers.length,
    });

    for (const [index, containerUri] of containers.entries()) {
      try {
        const listing = await this.listProvisionedContainer(containerUri);
        if (listing.status === 'ok' || listing.status === 'not-modified') {
          this.knownContainers.add(containerUri);
          await this.refreshListingResources(listing);
        } else {
          isDegraded = true;
          this.dataLayerState.addDiagnostics();
          Log.err('Solid container refresh unavailable', {
            operation: 'list-container',
            status: listing.status,
            httpStatus: listing.httpStatus,
          });
        }
      } catch (error) {
        isDegraded = true;
        this.dataLayerState.addDiagnostics();
        Log.err('Solid container refresh failed', safeError('list-container', error));
      }

      this.dataLayerState.setRefreshProgress({
        completedContainers: index + 1,
        totalContainers: containers.length,
      });
    }

    try {
      await this.solidRuntime.client.discovery.discoverType(SOLID_PRODUCTIVITY_TASK_TYPE);
      isDegraded = (await this.drainDiscoveryQueue()) || isDegraded;
      await this.enqueueReconciliation();
    } catch (error) {
      isDegraded = true;
      this.dataLayerState.addDiagnostics();
      Log.err('Solid native task discovery failed', safeError('discover-type', error));
    }

    this.dataLayerState.setPhase(isDegraded ? 'degraded' : 'ready');
    Log.normal(
      `Solid Pod refresh completed in ${Math.round(performance.now() - startedAt)}ms ` +
        `(${containers.length} containers, degraded=${isDegraded})`,
    );
  }

  private async listProvisionedContainer(
    containerUri: string,
  ): Promise<ContainerListing> {
    let listing = await this.solidRuntime.client.storage.listContainer(containerUri);
    if (listing.status !== 'missing') {
      return listing;
    }

    await this.solidRuntime.ensureAppContainer(containerUri, this.knownContainers);
    listing = await this.solidRuntime.client.storage.listContainer(containerUri);
    return listing;
  }

  private async refreshListingResources(listing: ContainerListing): Promise<void> {
    const resourceUris = Array.from(
      new Set(
        listing.entries
          .filter((entry) => entry.kind === 'resource')
          .map((entry) => entry.uri),
      ),
    );

    for (let index = 0; index < resourceUris.length; index += REFRESH_BATCH_SIZE) {
      const batch = resourceUris.slice(index, index + REFRESH_BATCH_SIZE);
      await this.solidRuntime.client.discovery.refresh({ uris: batch });
      if (!this.firstRefreshedEntityLogged && batch.length > 0) {
        this.firstRefreshedEntityLogged = true;
        Log.normal('Solid Pod first catalog resource refreshed');
      }
      await this.enqueueReconciliation();
    }
  }

  /** Returns true when discovery stopped before reaching a settled state. */
  private async drainDiscoveryQueue(): Promise<boolean> {
    const discovery = this.solidRuntime.client.discovery;

    for (let run = 0; run < MAX_DISCOVERY_CONTINUATIONS; run++) {
      const before = discovery.status();
      if (isDiscoverySettled(before)) {
        return false;
      }
      if (before.state === 'paused' || before.state === 'cancelled') {
        return true;
      }

      await discovery.refresh();
      const after = discovery.status();
      if (isDiscoverySettled(after)) {
        return false;
      }
      if (
        after.completedJobs === before.completedJobs &&
        after.queuedJobs === before.queuedJobs &&
        after.inFlightJobs === before.inFlightJobs
      ) {
        return true;
      }
    }

    return true;
  }

  private installSubscriptions(): void {
    this.stopSubscriptions();
    this.subscriptions.push(
      this.solidRuntime.client.discovery.subscribe(() => {
        this.scheduleReconciliation();
      }),
      this.solidRuntime.client.things.subscribe(
        {},
        () => {
          this.scheduleReconciliation();
        },
        { emitInitial: false },
      ),
    );
  }

  private stopSubscriptions(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  private scheduleReconciliation(): void {
    if (this.reconciliationTimer !== null) {
      return;
    }
    this.reconciliationTimer = setTimeout(() => {
      this.reconciliationTimer = null;
      void this.enqueueReconciliation();
    }, 0);
  }

  private enqueueReconciliation(): Promise<void> {
    this.reconciliationTail = this.reconciliationTail
      .catch(() => undefined)
      .then(async () => {
        await this.hydration.reconcileStore();
      });
    return this.reconciliationTail;
  }
}

const orderedContainers = (layout: RuntimeLayout): string[] => {
  const entries = Object.entries(layout.containers);
  const priority = new Map<string, number>(
    PRIORITY_CONTAINER_KEYS.map((key, index) => [key, index]),
  );
  return entries
    .sort(
      ([left], [right]) =>
        (priority.get(left) ?? PRIORITY_CONTAINER_KEYS.length) -
        (priority.get(right) ?? PRIORITY_CONTAINER_KEYS.length),
    )
    .map(([, containerUri]) => containerUri);
};

const isDiscoverySettled = (status: DiscoveryStatus): boolean =>
  status.queuedJobs === 0 && status.inFlightJobs === 0;

const safeError = (
  operation: string,
  error: unknown,
): { operation: string; errorName: string } => ({
  operation,
  errorName: error instanceof Error ? error.name : 'UnknownError',
});
