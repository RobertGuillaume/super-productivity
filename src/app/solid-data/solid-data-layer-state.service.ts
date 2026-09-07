import { inject, Injectable, Injector, signal } from '@angular/core';
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
  solidContainerKeysForActionType,
  SOLID_OWNED_PERSISTENT_ACTION_TYPES,
} from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';
import { configureSolidMutationGuard } from './solid-mutation-guard.meta-reducer';

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

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly injector = inject(Injector);
  private readonly snackService = inject(SnackService);
  private blockedMutationWasReported = false;
  private mutationRecoveryHandler: (() => Promise<void>) | null = null;

  readonly phase = signal<SolidDataLayerPhase>(
    isSolidDataLayerPrimaryEnabled() ? 'booting' : 'disabled',
  );
  readonly refreshProgress = signal<SolidRefreshProgress | null>(null);
  readonly diagnosticCount = signal(0);
  readonly writeReadyContainers = signal<ReadonlySet<SolidContainerKey>>(new Set());

  constructor() {
    configureSolidMutationGuard({
      owns: (action) => this.ownsPersistentAction(action),
      canApply: (action) => this.canApplyPersistentAction(action),
      onBlocked: (action) => this.reportBlockedMutation(action),
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
    this.writeReadyContainers.update((current) => {
      const next = new Set(current);
      if (isReady) {
        next.add(container);
        this.blockedMutationWasReported = false;
      } else {
        next.delete(container);
      }
      return next;
    });
  }

  clearWriteReadiness(): void {
    this.writeReadyContainers.set(new Set());
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
    const ready = this.writeReadyContainers();
    return targets.length > 0 && targets.every((target) => ready.has(target));
  }

  handleAuthenticationError(error: unknown): boolean {
    return this.injector
      .get(SolidSessionRecoveryService)
      .handleAuthenticationError(error);
  }

  recoverRejectedMutation(): void {
    void this.mutationRecoveryHandler?.();
  }

  registerMutationRecoveryHandler(handler: () => Promise<void>): void {
    this.mutationRecoveryHandler = handler;
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
