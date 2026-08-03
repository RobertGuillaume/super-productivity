import { inject, Injectable } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { isSolidDataLayerEnabled } from './solid-data-layer-feature-flag';
import { SolidRuntimeService } from './solid-runtime.service';
import { SOLID_PROJECT_TASK_ORDER_ACTION_TYPES } from './solid-project-task-order-action-types';
import { SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES } from './solid-task-tag-action-types';
import { SOLID_TODAY_ACTION_TYPES } from './solid-today-action-types';
import { SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES } from './solid-work-context-action-types';

@Injectable({ providedIn: 'root' })
export class SolidDataLayerStateService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly solidOwnedActionTypes = new Set<string>([
    ActionType.PROJECT_ADD,
    ActionType.PROJECT_UPDATE,
    ActionType.PROJECT_UPDATE_ADVANCED_CFG,
    ActionType.PROJECT_UPDATE_ORDER,
    ActionType.PROJECT_ARCHIVE,
    ActionType.PROJECT_UNARCHIVE,
    ActionType.PROJECT_COMPLETE,
    ActionType.PROJECT_REOPEN,
    ActionType.PROJECT_TOGGLE_HIDE,
    ActionType.TAG_ADD,
    ActionType.TAG_UPDATE,
    ActionType.TAG_UPDATE_ADVANCED_CONFIG,
    ActionType.TAG_UPDATE_ORDER,
    ActionType.TAG_DELETE,
    ActionType.TAG_DELETE_MULTIPLE,
    ActionType.NOTE_ADD,
    ActionType.NOTE_UPDATE,
    ActionType.NOTE_UPDATE_ORDER,
    ActionType.NOTE_DELETE,
    ActionType.NOTE_MOVE_TO_PROJECT,
    ActionType.TASK_SHARED_ADD,
    ActionType.TASK_SHARED_UPDATE,
    ActionType.TASK_SHARED_UPDATE_MULTIPLE,
    ActionType.TASK_SHARED_DELETE,
    ActionType.TASK_SHARED_DELETE_MULTIPLE,
    ...SOLID_PROJECT_TASK_ORDER_ACTION_TYPES,
    ...SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES,
    ...SOLID_TODAY_ACTION_TYPES,
    ...SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES,
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
