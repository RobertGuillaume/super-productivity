import { DestroyRef, inject, Injectable } from '@angular/core';
import type { RuntimeLayout, Unsubscribe } from '@solid-intents/runtime';
import { Log } from '../core/log';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { isSolidDataLayerPrimaryEnabled } from './solid-data-layer-feature-flag';
import { SolidDiscoverySessionRegistryService } from './solid-discovery-session-registry.service';
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import {
  SolidMutationIntentContext,
  SolidMutationIntentRegistry,
} from './solid-mutation-intent-registry.service';
import { SolidContainerKey } from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskAccessService } from './solid-task-access.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';
import {
  classifySolidRuntimeFailure,
  runSolidRuntimeStage,
  SolidRuntimeFailureDiagnostic,
} from './solid-runtime-failure';

const RECONCILIATION_DEBOUNCE_MS = 100;
const DISCOVERY_COORDINATION_RETRY_MS = 30_000;

/** Coordinates app policy around runtime-owned durable discovery sessions. */
@Injectable({ providedIn: 'root' })
export class SolidPodRefreshCoordinatorService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dataLayerState = inject(SolidDataLayerStateService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly sessions = inject(SolidDiscoverySessionRegistryService);
  private readonly hydration = inject(SolidTaskHydrationService);
  private readonly mutations = inject(SolidMutationCoordinator);
  private readonly taskAccess = inject(SolidTaskAccessService);
  private readonly identities = inject(SolidThingIdentityRegistry);
  private readonly containerAccess = inject(SolidContainerAccessService);
  private readonly mutationIntents = inject(SolidMutationIntentRegistry);

  private startPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private reconciliationPromise: Promise<void> | null = null;
  private reconciliationTimer: ReturnType<typeof setTimeout> | null = null;
  private subscription: Unsubscribe | null = null;
  private started = false;
  private startupFailed = false;
  private rootVerified = false;
  private lifecycleGeneration = 0;
  private automaticStartupRetryUsed = false;
  private startupRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private startupRetryPromise: Promise<void> | null = null;
  private readonly recoveryPromises = new WeakMap<object, Promise<void>>();
  private recoveryWithoutIntent: Promise<void> | null = null;

  constructor() {
    this.dataLayerState.registerMutationRecoveryHandler((context, error, source) =>
      this.recoverRejectedMutation(context, error, source),
    );
    const online = (): void => {
      void this.handleOnlineTransition();
    };
    const offline = (): void => {
      this.cancelStartupRetryTimer();
      this.dataLayerState.clearWriteReadiness();
      void this.sessions
        .pause()
        .catch((error) => this.reportFailure('discovery-offline-pause', error));
      this.dataLayerState.setPhase('degraded');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      this.cancelStartupRetryTimer();
      this.stopSubscription();
      if (this.reconciliationTimer !== null) clearTimeout(this.reconciliationTimer);
      void this.sessions.pause();
    });
  }

  start(): Promise<void> {
    if (this.started) {
      return this.startupFailed
        ? this.retryDiscoveryStartup(true)
        : (this.refreshPromise ?? Promise.resolve());
    }
    if (this.startPromise !== null) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => (this.startPromise = null));
    return this.startPromise;
  }

  refreshNow(): Promise<void> {
    if (this.startupFailed) return this.retryDiscoveryStartup(true);
    if (!this.started) return this.start();
    if (this.refreshPromise !== null) return this.refreshPromise;
    if (!this.canRun()) return Promise.resolve();
    this.refreshPromise = this.refreshManually()
      .catch((error) => this.handleStartupFailure('discovery-manual-refresh', error))
      .finally(() => (this.refreshPromise = null));
    return this.refreshPromise;
  }

  recoverRejectedMutation(
    context: SolidMutationIntentContext | null = this.mutationIntents.latest(),
    error: unknown = null,
    source = '',
  ): Promise<void> {
    if (context === null) {
      if (this.recoveryWithoutIntent !== null) return this.recoveryWithoutIntent;
      this.recoveryWithoutIntent = this.recoverMutationIntent(null, source).finally(
        () => {
          this.mutations.completeFailedIntent(null, error);
          this.recoveryWithoutIntent = null;
        },
      );
      return this.recoveryWithoutIntent;
    }
    const pending = this.recoveryPromises.get(context.action);
    if (pending !== undefined) return pending;
    const recovery = this.recoverMutationIntent(context, source).finally(() => {
      this.mutations.completeFailedIntent(context.action, error);
      this.recoveryPromises.delete(context.action);
    });
    this.recoveryPromises.set(context.action, recovery);
    return recovery;
  }

  async restartAfterRuntimeBoot(): Promise<void> {
    this.cancelStartupRetryTimer();
    this.lifecycleGeneration++;
    await this.sessions.pause();
    this.stopSubscription();
    this.identities.clear();
    this.mutationIntents.clear();
    this.hydration.resetCatalogBaseline();
    this.taskAccess.clear();
    this.dataLayerState.clearWriteReadiness();
    this.rootVerified = false;
    this.started = false;
    this.startupFailed = false;
    this.automaticStartupRetryUsed = false;
    this.startPromise = null;
    this.refreshPromise = null;
    await this.hydration.reconcileStore();
    await this.start();
  }

  private async startInternal(): Promise<void> {
    if (!this.canRun()) return;
    const generation = this.lifecycleGeneration;
    this.dataLayerState.setRuntimeBinding({ status: 'resolving', generation });
    try {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      this.rootVerified = resolution.status !== 'unavailable';
      if (resolution.status !== 'unavailable') {
        this.dataLayerState.setRuntimeBinding({
          status: resolution.status,
          generation,
          storageRoot: resolution.storageRoot,
          webId: resolution.webId,
        });
      }
      if (resolution.changed) {
        this.identities.clear();
        this.mutationIntents.clear();
        this.hydration.resetCatalogBaseline();
        this.taskAccess.clear();
        await this.hydration.reconcileStore();
      }
    } catch (error) {
      this.rootVerified = false;
      this.dataLayerState.setRuntimeBinding({ status: 'untrusted', generation });
      await this.handleStartupFailure('root-discovery', error);
    }
    this.started = true;
    if (!this.rootVerified || generation !== this.lifecycleGeneration) {
      this.startupFailed = !this.rootVerified;
      if (!this.rootVerified) {
        this.dataLayerState.setRuntimeBinding({ status: 'untrusted', generation });
      }
      this.dataLayerState.setPhase('degraded');
      return;
    }

    const layout = this.solidRuntime.ensureLayout();
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') return;
    try {
      await runSolidRuntimeStage('container-provisioning', () =>
        this.solidRuntime.ensureAppContainers(),
      );
      await runSolidRuntimeStage('session-initialization', () =>
        this.sessions.initialize(layout, auth.webId, () => this.scheduleReconciliation()),
      );
      this.installSubscription();
      this.setProgress(layout, 0);
      await this.sessions.runStartupPass();
      await runSolidRuntimeStage('permission-reconciliation', () =>
        this.reconcileAndCheckAccess(layout, generation),
      );
      this.markStartupSuccessful();
    } catch (error) {
      await this.handleStartupFailure('discovery-startup', error);
    }
  }

  private async refreshManually(): Promise<void> {
    if (!this.rootVerified) {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      this.rootVerified = resolution.status !== 'unavailable';
      if (resolution.status !== 'unavailable') {
        this.dataLayerState.setRuntimeBinding({
          status: resolution.status,
          generation: this.lifecycleGeneration,
          storageRoot: resolution.storageRoot,
          webId: resolution.webId,
        });
      }
      if (resolution.changed) {
        await this.restartAfterRuntimeBoot();
        return;
      }
    }
    if (!this.rootVerified) {
      this.dataLayerState.setPhase('degraded');
      return;
    }
    const layout = this.solidRuntime.ensureLayout();
    this.setProgress(layout, 0);
    await this.sessions.refreshAndRun();
    await runSolidRuntimeStage('permission-reconciliation', () =>
      this.reconcileAndCheckAccess(layout, this.lifecycleGeneration),
    );
    this.markStartupSuccessful();
  }

  private async handleOnlineTransition(): Promise<void> {
    if (!this.started) return;
    if (this.startupFailed) {
      await this.retryDiscoveryStartup(true);
      return;
    }

    try {
      await runSolidRuntimeStage('discovery-online-run', () => this.sessions.resume());
      const layout = this.solidRuntime.ensureLayout();
      await runSolidRuntimeStage('permission-reconciliation', () =>
        this.reconcileAndCheckAccess(layout, this.lifecycleGeneration),
      );
      this.markStartupSuccessful();
    } catch (error) {
      await this.handleStartupFailure('discovery-online-resume', error);
    }
  }

  private async reconcileAndCheckAccess(
    layout: RuntimeLayout,
    generation: number,
  ): Promise<void> {
    await this.enqueueReconciliation();
    const entries = Object.entries(layout.containers) as Array<
      [SolidContainerKey, string]
    >;
    const decisions = await Promise.allSettled(
      entries.map(
        async ([key, uri]) => [key, await this.containerAccess.check(uri)] as const,
      ),
    );
    if (generation !== this.lifecycleGeneration) return;
    let degraded = this.sessions.isDegraded() || this.hydration.hasDegradedState();
    decisions.forEach((result, index) => {
      const key = entries[index][0];
      const state = result.status === 'fulfilled' ? result.value[1].state : 'unavailable';
      this.dataLayerState.setContainerReadiness(key, state);
      degraded = degraded || state !== 'writable';
    });
    this.setProgress(layout, entries.length);
    this.dataLayerState.setPhase(degraded ? 'degraded' : 'ready');
    void this.taskAccess.scheduleExternalPermissionChecks();
  }

  private async recoverMutationIntent(
    context: SolidMutationIntentContext | null,
    source: string,
  ): Promise<void> {
    await this.mutations.whenIdle();
    const uris = context?.resourceUris ?? [];
    try {
      if (uris.length > 0) {
        await this.solidRuntime.client.discovery.refresh({ uris: [...new Set(uris)] });
      }
      await this.hydration.reconcileStore();
    } catch (error) {
      this.reportFailure(`recover-mutation:${source}`, error);
      if (context?.projection !== null && context?.projection !== undefined) {
        await this.hydration.restoreProjection(context.projection);
      } else {
        await this.hydration.restoreLastPublishedSnapshot();
      }
      this.dataLayerState.setPhase('degraded');
    }
  }

  private scheduleReconciliation(): void {
    if (this.reconciliationTimer !== null) clearTimeout(this.reconciliationTimer);
    this.reconciliationTimer = setTimeout(() => {
      this.reconciliationTimer = null;
      void this.enqueueReconciliation();
    }, RECONCILIATION_DEBOUNCE_MS);
  }

  private enqueueReconciliation(): Promise<void> {
    if (this.reconciliationPromise !== null) return this.reconciliationPromise;
    this.reconciliationPromise = (async () => {
      await this.mutations.whenIdle();
      await this.hydration.reconcileStore();
    })().finally(() => (this.reconciliationPromise = null));
    return this.reconciliationPromise;
  }

  private installSubscription(): void {
    this.stopSubscription();
    this.subscription = this.solidRuntime.client.things.subscribe(
      {},
      () => this.scheduleReconciliation(),
      { emitInitial: false },
    );
  }

  private stopSubscription(): void {
    this.subscription?.();
    this.subscription = null;
  }

  private canRun(): boolean {
    if (!isSolidDataLayerPrimaryEnabled()) {
      this.dataLayerState.setPhase('disabled');
      return false;
    }
    if (this.solidRuntime.client.auth.state().status !== 'authenticated') {
      this.dataLayerState.setPhase('sign-in-required');
      return false;
    }
    return true;
  }

  private setProgress(layout: RuntimeLayout, completedContainers: number): void {
    this.dataLayerState.setRefreshProgress({
      completedContainers,
      totalContainers: Object.keys(layout.containers).length,
    });
  }

  private async handleStartupFailure(operation: string, error: unknown): Promise<void> {
    const diagnostic = this.reportFailure(operation, error);
    this.startupFailed = true;
    this.dataLayerState.setPhase('degraded');
    this.stopSubscription();
    try {
      await this.sessions.pause();
    } catch (pauseError) {
      this.reportFailure('discovery-failure-pause', pauseError);
    }
    if (diagnostic.retryPolicy === 'coordination') {
      this.scheduleCoordinationRetry();
    }
  }

  private reportFailure(
    operation: string,
    error: unknown,
  ): SolidRuntimeFailureDiagnostic {
    const diagnostic = classifySolidRuntimeFailure(operation, error);
    this.dataLayerState.addDiagnostics();
    Log.err('Solid runtime operation failed', diagnostic);
    return diagnostic;
  }

  private scheduleCoordinationRetry(): void {
    if (
      this.automaticStartupRetryUsed ||
      this.startupRetryTimer !== null ||
      navigator.onLine === false
    ) {
      return;
    }
    this.automaticStartupRetryUsed = true;
    this.startupRetryTimer = setTimeout(() => {
      this.startupRetryTimer = null;
      void this.retryDiscoveryStartup(false);
    }, DISCOVERY_COORDINATION_RETRY_MS);
  }

  private retryDiscoveryStartup(resetAutomaticRetry: boolean): Promise<void> {
    if (this.startupRetryPromise !== null) return this.startupRetryPromise;
    this.cancelStartupRetryTimer();
    if (resetAutomaticRetry) this.automaticStartupRetryUsed = false;

    this.startupRetryPromise = (async () => {
      this.lifecycleGeneration++;
      await runSolidRuntimeStage('session-retry-pause', () => this.sessions.pause());
      this.stopSubscription();
      this.started = false;
      this.startupFailed = false;
      await this.start();
    })()
      .catch((error) => this.handleStartupFailure('discovery-startup-retry', error))
      .finally(() => (this.startupRetryPromise = null));
    return this.startupRetryPromise;
  }

  private markStartupSuccessful(): void {
    this.startupFailed = false;
    this.automaticStartupRetryUsed = false;
    this.cancelStartupRetryTimer();
  }

  private cancelStartupRetryTimer(): void {
    if (this.startupRetryTimer !== null) {
      clearTimeout(this.startupRetryTimer);
      this.startupRetryTimer = null;
    }
  }
}
