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

const RECONCILIATION_DEBOUNCE_MS = 100;

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
  private rootVerified = false;
  private lifecycleGeneration = 0;
  private readonly recoveryPromises = new WeakMap<object, Promise<void>>();
  private recoveryWithoutIntent: Promise<void> | null = null;

  constructor() {
    this.dataLayerState.registerMutationRecoveryHandler((context, error, source) =>
      this.recoverRejectedMutation(context, error, source),
    );
    const online = (): void => {
      if (this.started) {
        void this.sessions.resume().then(() => this.enqueueReconciliation());
      }
    };
    const offline = (): void => {
      void this.sessions.pause();
      this.dataLayerState.setPhase('degraded');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      this.stopSubscription();
      if (this.reconciliationTimer !== null) clearTimeout(this.reconciliationTimer);
      void this.sessions.pause();
    });
  }

  start(): Promise<void> {
    if (this.started) return this.refreshPromise ?? Promise.resolve();
    if (this.startPromise !== null) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => (this.startPromise = null));
    return this.startPromise;
  }

  refreshNow(): Promise<void> {
    if (!this.started) return this.start();
    if (this.refreshPromise !== null) return this.refreshPromise;
    if (!this.canRun()) return Promise.resolve();
    this.refreshPromise = this.refreshManually().finally(
      () => (this.refreshPromise = null),
    );
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
    this.startPromise = null;
    this.refreshPromise = null;
    await this.hydration.reconcileStore();
    await this.start();
  }

  private async startInternal(): Promise<void> {
    if (!this.canRun()) return;
    const generation = this.lifecycleGeneration;
    this.dataLayerState.clearWriteReadiness();
    try {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      this.rootVerified = resolution !== 'unavailable';
      if (resolution === 'changed') {
        this.identities.clear();
        this.mutationIntents.clear();
        this.hydration.resetCatalogBaseline();
        this.taskAccess.clear();
        await this.hydration.reconcileStore();
      }
    } catch (error) {
      this.rootVerified = false;
      this.reportFailure('root-discovery', error);
    }
    this.started = true;
    if (!this.rootVerified || generation !== this.lifecycleGeneration) {
      this.dataLayerState.setPhase('degraded');
      return;
    }

    const layout = this.solidRuntime.ensureLayout();
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') return;
    try {
      await this.solidRuntime.ensureAppContainers();
      await this.sessions.initialize(layout, auth.webId, () =>
        this.scheduleReconciliation(),
      );
      this.installSubscription();
      this.setProgress(layout, 0);
      await this.sessions.runStartupPass();
      await this.reconcileAndCheckAccess(layout, generation);
    } catch (error) {
      this.reportFailure('discovery-startup', error);
      this.dataLayerState.setPhase('degraded');
    }
  }

  private async refreshManually(): Promise<void> {
    if (!this.rootVerified) {
      const resolution = await this.solidRuntime.resolveAuthenticatedStorageRoot();
      this.rootVerified = resolution !== 'unavailable';
      if (resolution === 'changed') {
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
    await this.reconcileAndCheckAccess(layout, this.lifecycleGeneration);
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

  private reportFailure(operation: string, error: unknown): void {
    this.dataLayerState.addDiagnostics();
    Log.err('Solid runtime operation failed', {
      operation,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
