import { inject, Injectable, Injector } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import {
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
} from './solid-data-layer-feature-flag';
import { SOLID_OWNED_PERSISTENT_ACTION_TYPES } from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly injector = inject(Injector);

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
