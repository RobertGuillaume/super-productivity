import { inject, Injectable } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { isSolidDataLayerEnabled } from './solid-data-layer-feature-flag';
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
    return this.isActive() && action.type === ActionType.TASK_SHARED_ADD;
  }
}
