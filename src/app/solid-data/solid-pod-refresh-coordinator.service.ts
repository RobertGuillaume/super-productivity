import { DestroyRef, inject, Injectable } from '@angular/core';
import type {
  ContainerListing,
  RuntimeLayout,
  Unsubscribe,
} from '@solid-intents/runtime';
import { Log } from '../core/log';
import { isSolidDataLayerPrimaryEnabled } from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import { SolidContainerKey } from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidTaskAccessService } from './solid-task-access.service';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidNativeTaskIndexService } from './solid-native-task-index.service';
import {
  SolidMutationIntentContext,
  SolidMutationIntentRegistry,
} from './solid-mutation-intent-registry.service';

const REFRESH_BATCH_SIZE = 10;
const ACCESS_CHECK_BATCH_SIZE = 2;
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
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly identities = inject(SolidThingIdentityRegistry);
  private readonly containerAccess = inject(SolidContainerAccessService);
  private readonly nativeTaskIndex = inject(SolidNativeTaskIndexService);
  private readonly mutationIntents = inject(SolidMutationIntentRegistry);

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
  private readonly recoveryPromises = new WeakMap<object, Promise<void>>();
  private recoveryWithoutIntent: Promise<void> | null = null;

  constructor() {
    this.dataLayerState.registerMutationRecoveryHandler((context, error, source) =>
      this.recoverRejectedMutation(context, error, source),
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

  recoverRejectedMutation(
    context: SolidMutationIntentContext | null = this.mutationIntents.latest(),
    error: unknown = null,
    source = '',
  ): Promise<void> {
    if (context === null) {
      if (this.recoveryWithoutIntent !== null) {
        return this.recoveryWithoutIntent;
      }
      this.recoveryWithoutIntent = this.recoverMutationIntent(null, source).finally(
        () => {
          this.mutations.completeFailedIntent(null, error);
          this.recoveryWithoutIntent = null;
        },
      );
      return this.recoveryWithoutIntent;
    }
    const pending = this.recoveryPromises.get(context.action);
    if (pending !== undefined) {
      return pending;
    }
    const recovery = this.recoverMutationIntent(context, source).finally(() => {
      this.mutations.completeFailedIntent(context.action, error);
      this.recoveryPromises.delete(context.action);
    });
    this.recoveryPromises.set(context.action, recovery);
    return recovery;
  }

  async restartAfterRuntimeBoot(): Promise<void> {
    this.lifecycleGeneration++;
    this.stopSubscriptions();
    this.knownContainers.clear();
    this.catalogAuthority.clear();
    this.identities.clear();
    this.mutationIntents.clear();
    this.hydration.resetCatalogBaseline();
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
        this.catalogAuthority.clear();
        this.identities.clear();
        this.mutationIntents.clear();
        this.hydration.resetCatalogBaseline();
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
          this.catalogAuthority.clear();
          this.identities.clear();
          this.mutationIntents.clear();
          this.hydration.resetCatalogBaseline();
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
    const accessCandidates: Array<[SolidContainerKey, string]> = [];
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
          this.catalogAuthority.recordListing(listing);
          this.solidRuntime.rememberAppContainerTree(containerUri, this.knownContainers);
          await this.refreshListingResources(listing);
          successfulContainerCount++;
          this.dataLayerState.setContainerReadiness(containerKey, 'checking');
          accessCandidates.push([containerKey, containerUri]);
        } else {
          isDegraded = true;
          this.dataLayerState.setContainerReadiness(containerKey, 'unavailable');
          this.dataLayerState.addDiagnostics();
          Log.err('Solid container refresh unavailable', {
            operation: 'list-container',
            status: listing.status,
            httpStatus: listing.httpStatus,
          });
        }
      } catch (error) {
        isDegraded = true;
        this.dataLayerState.setContainerReadiness(containerKey, 'unavailable');
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
      const nativeTargets = await this.nativeTaskIndex.readTargets();
      if (nativeTargets.diagnosticCount > 0) {
        isDegraded = true;
        this.dataLayerState.addDiagnostics();
      }
      const appContainerUris = containers.map(([, containerUri]) => containerUri);
      await this.refreshNativeTaskResources(
        nativeTargets.resourceUris.filter(
          (resourceUri) =>
            !appContainerUris.some((containerUri) =>
              isWithinContainer(resourceUri, containerUri),
            ),
        ),
      );
      for (const containerUri of nativeTargets.containerUris) {
        if (appContainerUris.includes(containerUri)) {
          continue;
        }
        const listing =
          await this.solidRuntime.client.storage.listContainer(containerUri);
        if (listing.status !== 'ok' && listing.status !== 'not-modified') {
          isDegraded = true;
          this.dataLayerState.addDiagnostics();
          Log.err('Solid native task container unavailable', {
            operation: 'list-native-task-container',
            status: listing.status,
            httpStatus: listing.httpStatus,
          });
          continue;
        }
        await this.refreshListingResources(listing);
      }
      this.canCheckNativeTaskAccess = true;
      await this.taskAccess.refreshExternalPermissions();
    } catch (error) {
      isDegraded = true;
      this.dataLayerState.addDiagnostics();
      Log.err(
        'Solid native task discovery failed',
        safeError('refresh-indexed-native-tasks', error),
      );
    }

    isDegraded =
      (await this.refreshContainerAccess(accessCandidates, generation)) || isDegraded;

    if (generation !== this.lifecycleGeneration) {
      return;
    }

    this.lastRefreshHadAuthoritativeData =
      this.rootVerified && successfulContainerCount > 0;
    isDegraded = this.hydration.hasDegradedState() || isDegraded;
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

  private async recoverMutationIntent(
    context: SolidMutationIntentContext | null,
    source: string,
  ): Promise<void> {
    await this.mutations.whenIdle();
    const containerKeys = context?.containerKeys.length
      ? context.containerKeys
      : containerKeysForPersistenceSource(source);
    const layout = this.solidRuntime.ensureLayout();
    let authoritative = this.rootVerified;
    this.coordinatedRefreshDepth++;
    try {
      if (context !== null && context.resourceUris.length > 0) {
        try {
          await this.refreshResourceUris(context.resourceUris);
        } catch (error) {
          authoritative = false;
          Log.err(
            'Solid mutation resource recovery failed',
            safeError('recover-resources', error),
          );
        }
      }

      for (const containerKey of containerKeys) {
        const containerUri = layout.containers[containerKey];
        if (containerUri === undefined) {
          authoritative = false;
          continue;
        }
        try {
          const listing =
            await this.solidRuntime.client.storage.listContainer(containerUri);
          if (listing.status !== 'ok' && listing.status !== 'not-modified') {
            authoritative = false;
            continue;
          }
          this.catalogAuthority.recordListing(listing);
          await this.refreshResourceUris(
            listing.entries
              .filter((entry) => entry.kind === 'resource')
              .map((entry) => entry.uri),
          );
        } catch (error) {
          authoritative = false;
          Log.err(
            'Solid mutation container recovery failed',
            safeError('recover-container', error),
          );
        }
      }

      await this.mutations.whenIdle();
      if (authoritative) {
        await this.hydration.reconcileStore();
        for (const containerKey of containerKeys) {
          const containerUri = layout.containers[containerKey];
          if (containerUri !== undefined) {
            this.dataLayerState.setContainerReadiness(
              containerKey,
              await this.containerAccess.check(containerUri),
            );
          }
        }
      } else {
        if (context?.projection !== null && context?.projection !== undefined) {
          await this.hydration.restoreProjection(context.projection);
        } else {
          await this.hydration.restoreLastPublishedSnapshot();
        }
        containerKeys.forEach((containerKey) =>
          this.dataLayerState.setContainerReadiness(containerKey, 'unavailable'),
        );
        this.dataLayerState.setPhase('degraded');
      }
      this.reconciliationRequested = false;
    } finally {
      this.coordinatedRefreshDepth--;
    }
  }

  private async refreshResourceUris(resourceUris: readonly string[]): Promise<void> {
    const uniqueUris = Array.from(new Set(resourceUris));
    for (let index = 0; index < uniqueUris.length; index += REFRESH_BATCH_SIZE) {
      await this.solidRuntime.client.discovery.refresh({
        uris: uniqueUris.slice(index, index + REFRESH_BATCH_SIZE),
      });
    }
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

  private async refreshNativeTaskResources(
    resourceUris: readonly string[],
  ): Promise<void> {
    const uniqueUris = Array.from(new Set(resourceUris));
    for (let index = 0; index < uniqueUris.length; index += REFRESH_BATCH_SIZE) {
      const batch = uniqueUris.slice(index, index + REFRESH_BATCH_SIZE);
      await this.solidRuntime.client.discovery.refresh({ uris: batch });
      if (!this.firstRefreshedEntityLogged) {
        this.firstRefreshedEntityLogged = true;
        Log.normal('Solid Pod first catalog resource refreshed');
      }
      await this.enqueueReconciliation();
    }
  }

  private async refreshContainerAccess(
    candidates: ReadonlyArray<readonly [SolidContainerKey, string]>,
    generation: number,
  ): Promise<boolean> {
    let isDegraded = false;
    for (let index = 0; index < candidates.length; index += ACCESS_CHECK_BATCH_SIZE) {
      const batch = candidates.slice(index, index + ACCESS_CHECK_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async ([containerKey, containerUri]) => ({
          containerKey,
          readiness: await this.containerAccess.check(containerUri),
        })),
      );
      if (generation !== this.lifecycleGeneration) {
        return true;
      }
      results.forEach((result, resultIndex) => {
        const containerKey = batch[resultIndex][0];
        const readiness =
          result.status === 'fulfilled' ? result.value.readiness : 'unavailable';
        this.dataLayerState.setContainerReadiness(containerKey, readiness);
        isDegraded = readiness !== 'writable' || isDegraded;
        if (result.status === 'rejected') {
          this.dataLayerState.addDiagnostics();
          Log.err(
            'Solid container access check failed',
            safeError('check-container-access', result.reason),
          );
        }
      });
    }
    return isDegraded;
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

const containerKeysForPersistenceSource = (source: string): SolidContainerKey[] => {
  const normalized = source.toLowerCase();
  const matches: Array<[string, SolidContainerKey[]]> = [
    ['archivestate', ['archiveState', 'archivedTasks']],
    ['archivedtask', ['archiveState', 'archivedTasks']],
    ['globalconfig', ['config']],
    ['menutree', ['menuTree']],
    ['issueprovider', ['issueProviders']],
    ['simplecounter', ['simpleCounters']],
    ['taskrepeatcfg', ['taskRepeatCfgs']],
    ['timetracking', ['timeTracking']],
    ['plugin', ['pluginUserData', 'pluginMetadata']],
    ['planner', ['planner']],
    ['project', ['projects']],
    ['section', ['sections']],
    ['metric', ['metrics']],
    ['board', ['boards']],
    ['note', ['notes']],
    ['tag', ['tags']],
    ['task', ['tasks']],
  ];
  return matches.find(([needle]) => normalized.includes(needle))?.[1] ?? [];
};

const isWithinContainer = (resourceUri: string, containerUri: string): boolean => {
  try {
    const resource = new URL(resourceUri);
    const container = new URL(containerUri);
    const containerPath = container.pathname.endsWith('/')
      ? container.pathname
      : `${container.pathname}/`;
    return (
      resource.origin === container.origin && resource.pathname.startsWith(containerPath)
    );
  } catch {
    return false;
  }
};

const safeError = (
  operation: string,
  error: unknown,
): { operation: string; errorName: string } => ({
  operation,
  errorName: error instanceof Error ? error.name : 'UnknownError',
});
