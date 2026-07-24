import { inject, Injectable } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { isSolidDataLayerEnabled } from './solid-data-layer-feature-flag';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly solidOwnedActionTypes = new Set<string>([
    ActionType.PROJECT_ADD,
    ActionType.PROJECT_UPDATE,
    ActionType.PROJECT_UPDATE_ADVANCED_CFG,
    ActionType.PROJECT_ARCHIVE,
    ActionType.PROJECT_UNARCHIVE,
    ActionType.PROJECT_COMPLETE,
    ActionType.PROJECT_REOPEN,
    ActionType.PROJECT_TOGGLE_HIDE,
    ActionType.TASK_SHARED_ADD,
    ActionType.TASK_SHARED_UPDATE,
    ActionType.TASK_SHARED_UPDATE_MULTIPLE,
    ActionType.TASK_SHARED_DELETE,
    ActionType.TASK_SHARED_DELETE_MULTIPLE,
  ]);

  isActive(): boolean {
    return (
      isSolidDataLayerEnabled() &&
      this.solidRuntime.client.auth.state().status === 'authenticated'
    );
  }

  ownsPersistentAction(action: PersistentAction): boolean {
    return this.isActive() && this.solidOwnedActionTypes.has(action.type);
  }
}
