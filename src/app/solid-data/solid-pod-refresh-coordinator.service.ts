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
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import { SolidContainerKey } from './solid-persistent-action-ownership';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidTaskAccessService } from './solid-task-access.service';

const REFRESH_BATCH_SIZE = 10;
const MAX_DISCOVERY_CONTINUATIONS = 100;
const OUT_OF_BAND_RECONCILIATION_DEBOUNCE_MS = 100;
const PRIORITY_CONTAINER_KEYS = ['tasks', 'projects', 'tags', 'app', 'config'] as const;

/** Coordinates all network-backed Solid catalog refresh work for the application. */
@Injectable({ providedIn: 'root' })
export class SolidPodRefreshCoordinatorService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dataLayerState = inject(SolidDataLayerStateService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly hydration = inject(SolidTaskHydrationService);
  private readonly mutations = inject(SolidMutationCoordinator);
  private readonly taskAccess = inject(SolidTaskAccessService);

  private startPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private reconciliationPromise: Promise<void> | null = null;
  private reconciliationRequested = false;
  private reconciliationTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions: Unsubscribe[] = [];
  private knownContainers = new Set<string>();
  private started = false;
  private firstRefreshedEntityLogged = false;
  private rootVerified = false;
  private lastRefreshHadAuthoritativeData = false;
  private canCheckNativeTaskAccess = false;
  private lifecycleGeneration = 0;
  private coordinatedRefreshDepth = 0;

  constructor() {
    this.dataLayerState.registerMutationRecoveryHandler(() =>
      this.recoverRejectedMutation(),
    );
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
    if (!this.started) {
      return this.start();
    }
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

    this.refreshPromise = this.refreshManually().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async recoverRejectedMutation(): Promise<void> {
    await this.mutations.whenIdle();
    await this.refreshNow();
    if (!this.lastRefreshHadAuthoritativeData) {
      await this.hydration.restoreLastPublishedSnapshot();
      this.dataLayerState.clearWriteReadiness();
      this.dataLayerState.setPhase('degraded');
    }
  }

  async restartAfterRuntimeBoot(): Promise<void> {
    this.lifecycleGeneration++;
    this.stopSubscriptions();
    this.knownContainers.clear();
    this.taskAccess.clear();
    this.dataLayerState.clearWriteReadiness();
    this.rootVerified = false;
    this.started = false;
    this.startPromise = null;
    this.refreshPromise = null;
    await this.hydration.reconcileStore();
    await this.start();
  }

  private async startInternal(): Promise<void> {
    const generation = this.lifecycleGeneration;
    if (!isSolidDataLayerPrimaryEnabled()) {
      this.dataLayerState.setPhase('disabled');
      return;
    }
    if (this.solidRuntime.client.auth.state().status !== 'authenticated') {
      this.dataLayerState.setPhase('sign-in-required');
      return;
    }

    this.dataLayerState.clearWriteReadiness();
    let rootUnavailable = false;
    try {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      rootUnavailable = resolution === 'unavailable';
      this.rootVerified = !rootUnavailable;
      if (resolution === 'changed') {
        this.stopSubscriptions();
        this.knownContainers.clear();
        this.taskAccess.clear();
        await this.hydration.reconcileStore();
      }
    } catch (error) {
      rootUnavailable = true;
      this.rootVerified = false;
      this.dataLayerState.addDiagnostics();
      Log.err('Solid storage root activation failed', safeError('root-discovery', error));
    }

    this.started = true;
    if (generation !== this.lifecycleGeneration) {
      return;
    }
    if (rootUnavailable) {
      this.dataLayerState.setPhase('degraded');
      return;
    }

    this.installSubscriptions();
    this.refreshPromise = this.refreshCatalog(rootUnavailable, generation).finally(() => {
      this.refreshPromise = null;
    });
    await this.refreshPromise;
  }

  private async refreshManually(): Promise<void> {
    if (!this.rootVerified) {
      try {
        const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
        this.rootVerified = resolution !== 'unavailable';
        if (resolution === 'changed') {
          this.stopSubscriptions();
          this.knownContainers.clear();
          this.taskAccess.clear();
          this.dataLayerState.clearWriteReadiness();
          await this.hydration.reconcileStore();
          this.installSubscriptions();
        }
      } catch (error) {
        this.rootVerified = false;
        this.dataLayerState.addDiagnostics();
        Log.err('Solid storage root refresh failed', safeError('root-discovery', error));
      }
    }
    if (!this.rootVerified) {
      this.dataLayerState.setPhase('degraded');
      return;
    }
    if (this.subscriptions.length === 0) {
      this.installSubscriptions();
    }
    await this.refreshCatalog(!this.rootVerified, this.lifecycleGeneration);
  }

  private async refreshCatalog(
    initiallyDegraded: boolean,
    generation: number,
  ): Promise<void> {
    this.coordinatedRefreshDepth++;
    try {
      await this.refreshCatalogInternal(initiallyDegraded, generation);
    } finally {
      this.coordinatedRefreshDepth--;
      if (this.coordinatedRefreshDepth === 0 && this.reconciliationRequested) {
        this.scheduleReconciliation();
      }
    }
  }

  private async refreshCatalogInternal(
    initiallyDegraded: boolean,
    generation: number,
  ): Promise<void> {
    const startedAt = performance.now();
    const containers = orderedContainers(this.solidRuntime.ensureLayout());
    let isDegraded = initiallyDegraded;
    let successfulContainerCount = 0;
    this.lastRefreshHadAuthoritativeData = false;
    this.canCheckNativeTaskAccess = false;

    this.dataLayerState.setRefreshProgress({
      completedContainers: 0,
      totalContainers: containers.length,
    });

    for (const [index, [containerKey, containerUri]] of containers.entries()) {
      if (generation !== this.lifecycleGeneration) {
        return;
      }
      try {
        const listing = await this.listProvisionedContainer(containerUri);
        if (listing.status === 'ok' || listing.status === 'not-modified') {
          this.solidRuntime.rememberAppContainerTree(containerUri, this.knownContainers);
          await this.refreshListingResources(listing);
          successfulContainerCount++;
          this.dataLayerState.setContainerWriteReady(containerKey, !initiallyDegraded);
        } else {
          isDegraded = true;
          this.dataLayerState.setContainerWriteReady(containerKey, false);
          this.dataLayerState.addDiagnostics();
          Log.err('Solid container refresh unavailable', {
            operation: 'list-container',
            status: listing.status,
            httpStatus: listing.httpStatus,
          });
        }
      } catch (error) {
        isDegraded = true;
        this.dataLayerState.setContainerWriteReady(containerKey, false);
        this.dataLayerState.addDiagnostics();
        Log.err('Solid container refresh failed', safeError('list-container', error));
      }

      this.dataLayerState.setRefreshProgress({
        completedContainers: index + 1,
        totalContainers: containers.length,
      });
    }

    if (generation !== this.lifecycleGeneration) {
      return;
    }

    try {
      await this.solidRuntime.client.discovery.discoverType(SOLID_PRODUCTIVITY_TASK_TYPE);
      await this.enqueueReconciliation();
      isDegraded = (await this.drainDiscoveryQueue()) || isDegraded;
      this.canCheckNativeTaskAccess = true;
      await this.taskAccess.refreshExternalPermissions();
    } catch (error) {
      isDegraded = true;
      this.dataLayerState.addDiagnostics();
      Log.err('Solid native task discovery failed', safeError('discover-type', error));
    }

    if (generation !== this.lifecycleGeneration) {
      return;
    }

    this.lastRefreshHadAuthoritativeData =
      this.rootVerified && successfulContainerCount > 0;
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
    if (resourceUris.length === 0) {
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
      if (after.completedJobs > before.completedJobs) {
        await this.enqueueReconciliation();
      }
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
    this.reconciliationRequested = true;
    if (this.coordinatedRefreshDepth > 0) {
      return;
    }
    if (this.reconciliationTimer !== null) {
      clearTimeout(this.reconciliationTimer);
    }
    this.reconciliationTimer = setTimeout(() => {
      this.reconciliationTimer = null;
      void this.enqueueReconciliation();
    }, OUT_OF_BAND_RECONCILIATION_DEBOUNCE_MS);
  }

  private enqueueReconciliation(): Promise<void> {
    this.reconciliationRequested = true;
    if (this.reconciliationPromise !== null) {
      return this.reconciliationPromise;
    }

    this.reconciliationPromise = this.drainReconciliations().finally(() => {
      this.reconciliationPromise = null;
    });
    return this.reconciliationPromise;
  }

  private async drainReconciliations(): Promise<void> {
    while (this.reconciliationRequested) {
      this.reconciliationRequested = false;
      await this.mutations.whenIdle();
      await this.hydration.reconcileStore();
      if (this.canCheckNativeTaskAccess) {
        await this.taskAccess.refreshExternalPermissions({ unknownOnly: true });
      }
    }
  }
}

const orderedContainers = (layout: RuntimeLayout): Array<[SolidContainerKey, string]> => {
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
    .map(([key, containerUri]) => [key as SolidContainerKey, containerUri]);
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
