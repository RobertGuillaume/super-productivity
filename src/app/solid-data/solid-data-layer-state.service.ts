import { inject, Injectable } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { isSolidDataLayerEnabled } from './solid-data-layer-feature-flag';
import { SOLID_OWNED_PERSISTENT_ACTION_TYPES } from './solid-persistent-action-ownership';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  isActive(): boolean {
    return (
      isSolidDataLayerEnabled() &&
      this.solidRuntime.client.auth.state().status === 'authenticated'
    );
  }

  ownsPersistentAction(action: PersistentAction): boolean {
    return this.isActive() && SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(action.type);
  }
}
