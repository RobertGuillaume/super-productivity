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
} from './solid-mutation-intent-registry.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import type { SolidAccessState } from './solid-access.model';

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

    const targets = solidContainerKeysForActionType(action.type);
    const readiness = this.writeReadiness();
    if (
      targets.length === 0 ||
      !targets.every((target) => readiness.get(target) === 'writable')
    ) {
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

  demoteWriteAccessAfterFailure(error: unknown): void {
    const httpStatus = findHttpStatus(error);
    const readiness: SolidWriteReadiness =
      httpStatus === 401 || httpStatus === 403
        ? 'read-only'
        : httpStatus === 429
          ? 'rate-limited'
          : 'unavailable';
    const affected = this.mutationIntents.forFailure(error)?.containerKeys ?? [];
    this.writeReadiness.update((current) => {
      const next = new Map(current);
      const targets = affected.length > 0 ? affected : Array.from(current.keys());
      targets.forEach((key) => next.set(key, readiness));
      return next;
    });
  }

  async recoverRejectedMutation(error: unknown, source: string): Promise<void> {
    await this.injector.get(SolidSessionRecoveryService).whenRecoverySettled();
    await this.mutationRecoveryHandler?.(
      this.mutationIntents.forFailure(error),
      error,
      source,
    );
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
    this.mutationIntents.record(
      action,
      solidContainerKeysForActionType(action.type),
      this.injector.get(SolidTaskHydrationService).captureLastPublishedProjection(),
    );
  }

  private reportBlockedMutation(action: PersistentAction): void {
    Log.warn('Blocked Solid mutation before reducer application', {
      operation: action.type,
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
}

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
