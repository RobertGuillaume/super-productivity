import { inject, Injectable, Injector, signal } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import {
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
} from './solid-data-layer-feature-flag';
import { SOLID_OWNED_PERSISTENT_ACTION_TYPES } from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';

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

  readonly phase = signal<SolidDataLayerPhase>(
    isSolidDataLayerPrimaryEnabled() ? 'booting' : 'disabled',
  );
  readonly refreshProgress = signal<SolidRefreshProgress | null>(null);
  readonly diagnosticCount = signal(0);

  setPhase(phase: SolidDataLayerPhase): void {
    this.phase.set(phase);
    if (phase !== 'refreshing') {
      this.refreshProgress.set(null);
    }
  }

  setRefreshProgress(progress: SolidRefreshProgress): void {
    this.phase.set('refreshing');
    this.refreshProgress.set(progress);
  }

  addDiagnostics(count = 1): void {
    this.diagnosticCount.update((current) => current + count);
  }

  isActive(): boolean {
    return (
      isSolidDataLayerEnabled() &&
      isSolidDataLayerPrimaryEnabled() &&
      this.solidRuntime.client.auth.state().status === 'authenticated'
    );
  }

  ownsPersistentAction(action: PersistentAction): boolean {
    return this.isActive() && SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(action.type);
  }

  handleAuthenticationError(error: unknown): boolean {
    return this.injector
      .get(SolidSessionRecoveryService)
      .handleAuthenticationError(error);
  }
}
