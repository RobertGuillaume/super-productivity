import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  Injector,
  signal,
} from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import {
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
} from './solid-data-layer-feature-flag';
import {
  SolidContainerKey,
  solidActionAffectsAllTasks,
  solidContainerKeysForActionType,
  solidTaskIdsForAction,
  SOLID_OWNED_PERSISTENT_ACTION_TYPES,
} from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';
import { configureSolidMutationGuard } from './solid-mutation-guard.meta-reducer';
import { SolidTaskAccessService } from './solid-task-access.service';
import {
  SolidMutationIntentContext,
  SolidMutationIntentRegistry,
  solidEntitiesForAction,
} from './solid-mutation-intent-registry.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import type { SolidAccessState } from './solid-access.model';
import { classifySolidRuntimeOutcomes, outcomesFromError } from './solid-runtime-outcome';

export type SolidMutationTargetState =
  | 'reconciling'
  | 'deferred'
  | 'authentication-blocked'
  | 'quarantined';

export type SolidDataLayerPhase =
  | 'disabled'
  | 'booting'
  | 'hydrating-cache'
  | 'sign-in-required'
  | 'refreshing'
  | 'ready'
  | 'degraded'
  | 'unavailable';

export interface SolidRefreshProgress {
  completedContainers: number;
  totalContainers: number;
}

export type SolidWriteReadiness = SolidAccessState;

export type SolidRuntimeBindingState =
  | { status: 'untrusted'; generation: number }
  | { status: 'resolving'; generation: number }
  | {
      status: 'trusted-live' | 'trusted-cache';
      generation: number;
      storageRoot: string;
      webId: string;
    };

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly injector = inject(Injector);
  private readonly snackService = inject(SnackService);
  private readonly taskAccess = inject(SolidTaskAccessService);
  private readonly mutationIntents = inject(SolidMutationIntentRegistry);
  private blockedMutationWasReported = false;
  private rateLimitClearTimer: ReturnType<typeof setTimeout> | null = null;
  private mutationRecoveryHandler:
    | ((
        context: SolidMutationIntentContext | null,
        error: unknown,
        source: string,
      ) => Promise<void>)
    | null = null;

  readonly phase = signal<SolidDataLayerPhase>(
    isSolidDataLayerPrimaryEnabled() ? 'booting' : 'disabled',
  );
  readonly refreshProgress = signal<SolidRefreshProgress | null>(null);
  readonly diagnosticCount = signal(0);
  readonly rateLimitedUntil = signal<Date | null>(null);
  readonly runtimeBinding = signal<SolidRuntimeBindingState>({
    status: 'untrusted',
    generation: 0,
  });
  readonly mutationTargets = signal<ReadonlyMap<string, SolidMutationTargetState>>(
    new Map(),
  );
  readonly writeReadiness = signal<ReadonlyMap<SolidContainerKey, SolidWriteReadiness>>(
    new Map(),
  );
  readonly writeReadyContainers = computed<ReadonlySet<SolidContainerKey>>(
    () =>
      new Set(
        Array.from(this.writeReadiness())
          .filter(([, readiness]) => readiness === 'writable')
          .map(([container]) => container),
      ),
  );

  constructor() {
    configureSolidMutationGuard({
      owns: (action) => this.ownsPersistentAction(action),
      canApply: (action) => this.canApplyPersistentAction(action),
      onBlocked: (action) => this.reportBlockedMutation(action),
      onAccepted: (action) => this.captureMutationIntent(action),
    });
    const unsubscribe = this.solidRuntime.client.diagnostics?.subscribeRateLimits?.(
      (event) => this.recordRateLimit(event.status.cooldownUntil),
    );
    this.destroyRef.onDestroy(() => {
      unsubscribe?.();
      if (this.rateLimitClearTimer !== null) {
        clearTimeout(this.rateLimitClearTimer);
      }
    });
  }

  setPhase(phase: SolidDataLayerPhase): void {
    this.phase.set(phase);
    if (phase !== 'refreshing') {
      this.refreshProgress.set(null);
    }
    if (
      phase === 'disabled' ||
      phase === 'booting' ||
      phase === 'hydrating-cache' ||
      phase === 'sign-in-required' ||
      phase === 'unavailable'
    ) {
      this.clearWriteReadiness();
    }
  }

  setRefreshProgress(progress: SolidRefreshProgress): void {
    this.phase.set('refreshing');
    this.refreshProgress.set(progress);
  }

  addDiagnostics(count = 1): void {
    this.diagnosticCount.update((current) => current + count);
  }

  setContainerWriteReady(container: SolidContainerKey, isReady: boolean): void {
    this.setContainerReadiness(container, isReady ? 'writable' : 'unknown');
  }

  setContainerReadiness(
    container: SolidContainerKey,
    readiness: SolidWriteReadiness,
  ): void {
    this.writeReadiness.update((current) => {
      const next = new Map(current);
      next.set(container, readiness);
      if (readiness === 'writable') {
        this.blockedMutationWasReported = false;
      }
      return next;
    });
  }

  containerReadiness(container: SolidContainerKey): SolidWriteReadiness {
    return this.writeReadiness().get(container) ?? 'unknown';
  }

  clearWriteReadiness(): void {
    this.writeReadiness.set(new Map());
  }

  setRuntimeBinding(binding: SolidRuntimeBindingState): void {
    const previous = this.runtimeBinding();
    this.runtimeBinding.set(binding);
    if (binding.status === 'trusted-live' || binding.status === 'trusted-cache') {
      if (
        previous.status === 'untrusted' ||
        previous.status === 'resolving' ||
        previous.generation !== binding.generation ||
        previous.storageRoot !== binding.storageRoot ||
        previous.webId !== binding.webId
      ) {
        this.mutationIntents.clear();
        this.mutationTargets.set(new Map());
      }
      this.mutationIntents.activateBinding({
        runtimeGeneration: binding.generation,
        storageRoot: binding.storageRoot,
        webId: binding.webId,
      });
    } else {
      this.mutationIntents.clear();
      this.mutationTargets.set(new Map());
    }
  }

  private recordRateLimit(cooldownUntil: Date | null): void {
    if (cooldownUntil === null) {
      return;
    }
    const current = this.rateLimitedUntil();
    const next =
      current !== null && current.getTime() > cooldownUntil.getTime()
        ? current
        : cooldownUntil;
    this.rateLimitedUntil.set(next);
    if (this.rateLimitClearTimer !== null) {
      clearTimeout(this.rateLimitClearTimer);
    }
    this.rateLimitClearTimer = setTimeout(
      () => {
        this.rateLimitClearTimer = null;
        const active = this.rateLimitedUntil();
        if (active !== null && active.getTime() <= Date.now()) {
          this.rateLimitedUntil.set(null);
        }
      },
      Math.max(0, next.getTime() - Date.now()),
    );
  }

  isActive(): boolean {
    return (
      isSolidDataLayerEnabled() &&
      isSolidDataLayerPrimaryEnabled() &&
      this.solidRuntime.client.auth.state().status === 'authenticated'
    );
  }

  ownsPersistentAction(action: PersistentAction): boolean {
    return (
      isSolidDataLayerEnabled() &&
      isSolidDataLayerPrimaryEnabled() &&
      SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(action.type)
    );
  }

  canApplyPersistentAction(action: PersistentAction): boolean {
    if (!this.ownsPersistentAction(action) || !this.isActive()) {
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }
    const binding = this.runtimeBinding();
    if (binding.status !== 'trusted-live' && binding.status !== 'trusted-cache') {
      return false;
    }
    const blockedTargets = this.mutationTargets();
    if (mutationKeysForAction(action).some((key) => blockedTargets.has(key))) {
      return false;
    }

    if (
      solidActionAffectsAllTasks(action.type) &&
      this.taskAccess.hasBlockedExternalTask()
    ) {
      return false;
    }
    return this.taskAccess.canMutateTasks(solidTaskIdsForAction(action));
  }

  handleAuthenticationError(error: unknown): boolean {
    return this.injector
      .get(SolidSessionRecoveryService)
      .handleAuthenticationError(error);
  }

  demoteWriteAccessAfterFailure(
    error: unknown,
    context: SolidMutationIntentContext | null,
  ): void {
    const httpStatus = findHttpStatus(error);
    const readiness: SolidWriteReadiness =
      httpStatus === 401 || httpStatus === 403
        ? 'read-only'
        : httpStatus === 429
          ? 'rate-limited'
          : 'unavailable';
    const affected = context?.containerKeys ?? [];
    if (context !== null && this.mutationIntents.isCurrent(context)) {
      const classification = classifySolidRuntimeOutcomes(outcomesFromError(error));
      const targetState: SolidMutationTargetState =
        httpStatus === 401
          ? 'authentication-blocked'
          : httpStatus === 403
            ? 'quarantined'
            : classification.state === 'deferred'
              ? 'deferred'
              : 'reconciling';
      this.setMutationTargetState(context, targetState);
    }
    this.writeReadiness.update((current) => {
      const next = new Map(current);
      const targets = affected.length > 0 ? affected : Array.from(current.keys());
      targets.forEach((key) => next.set(key, readiness));
      return next;
    });
  }

  mutationContextFor(action: object): SolidMutationIntentContext | null {
    return this.mutationIntents.forAction(action);
  }

  requireMutationContext(action: object): SolidMutationIntentContext {
    const context = this.mutationContextFor(action);
    if (context === null) {
      throw new Error('Accepted Solid action has no mutation context');
    }
    return context;
  }

  async recoverRejectedMutation(
    context: SolidMutationIntentContext | null,
    error: unknown,
    source: string,
  ): Promise<void> {
    await this.injector.get(SolidSessionRecoveryService).whenRecoverySettled();
    try {
      await this.mutationRecoveryHandler?.(context, error, source);
      if (context !== null && this.mutationIntents.isCurrent(context)) {
        this.clearMutationTargetState(context);
      }
    } catch (recoveryError) {
      if (context !== null && this.mutationIntents.isCurrent(context)) {
        this.setMutationTargetState(context, 'quarantined');
      }
      throw recoveryError;
    }
  }

  registerMutationRecoveryHandler(
    handler: (
      context: SolidMutationIntentContext | null,
      error: unknown,
      source: string,
    ) => Promise<void>,
  ): void {
    this.mutationRecoveryHandler = handler;
  }

  private captureMutationIntent(action: PersistentAction): void {
    const binding = this.runtimeBinding();
    if (binding.status !== 'trusted-live' && binding.status !== 'trusted-cache') {
      return;
    }
    const catalog = this.injector
      .get(SolidTaskHydrationService)
      .captureLastPublishedProjection();
    this.mutationIntents.record(
      action,
      solidContainerKeysForActionType(action.type),
      catalog?.generation ?? 0,
      {
        runtimeGeneration: binding.generation,
        storageRoot: binding.storageRoot,
        webId: binding.webId,
      },
    );
  }

  private reportBlockedMutation(action: PersistentAction): void {
    const readiness = this.writeReadiness();
    const binding = this.runtimeBinding();
    const blockedContainers = solidContainerKeysForActionType(action.type)
      .filter((container) => readiness.get(container) !== 'writable')
      .map((container) => ({
        container,
        state: readiness.get(container) ?? 'unknown',
      }));
    Log.warn('Blocked Solid mutation before reducer application', {
      operation: action.type,
      blockedContainers,
      blockedExternalTask: !this.taskAccess.canMutateTasks(solidTaskIdsForAction(action)),
      reason:
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'offline'
          : binding.status === 'untrusted' || binding.status === 'resolving'
            ? 'storage-root-untrusted'
            : mutationKeysForAction(action).some((key) => this.mutationTargets().has(key))
              ? 'mutation-recovery'
              : 'external-access',
    });
    if (this.blockedMutationWasReported) {
      return;
    }

    this.blockedMutationWasReported = true;
    this.snackService.open({
      type: 'WARNING',
      msg: T.PS.SOLID.WRITE_NOT_READY,
    });
  }

  private setMutationTargetState(
    context: SolidMutationIntentContext,
    state: SolidMutationTargetState,
  ): void {
    this.mutationTargets.update((current) => {
      const next = new Map(current);
      mutationKeysForContext(context).forEach((key) => next.set(key, state));
      return next;
    });
  }

  private clearMutationTargetState(context: SolidMutationIntentContext): void {
    this.mutationTargets.update((current) => {
      const next = new Map(current);
      mutationKeysForContext(context).forEach((key) => next.delete(key));
      return next;
    });
  }
}

const mutationKeysForAction = (action: PersistentAction): readonly string[] => {
  const entityKeys = solidEntitiesForAction(action).map(
    ({ model, id }) => `${model}:${id}`,
  );
  return entityKeys.length > 0
    ? entityKeys
    : solidContainerKeysForActionType(action.type).map((key) => `container:${key}`);
};

const mutationKeysForContext = (
  context: SolidMutationIntentContext,
): readonly string[] =>
  context.entityKeys.length > 0
    ? context.entityKeys
    : context.containerKeys.map((key) => `container:${key}`);

const findHttpStatus = (value: unknown, seen = new Set<unknown>()): number | null => {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return null;
  }
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const key of ['httpStatus', 'status']) {
    if (typeof record[key] === 'number') {
      return record[key];
    }
  }
  for (const key of ['details', 'outcomes', 'cause']) {
    const child = record[key];
    const values = Array.isArray(child) ? child : [child];
    for (const nested of values) {
      const status = findHttpStatus(nested, seen);
      if (status !== null) {
        return status;
      }
    }
  }
  return null;
};
