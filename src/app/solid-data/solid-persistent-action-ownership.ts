import { ActionType } from '../op-log/core/operation.types';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { SOLID_ARCHIVE_STATE_ACTION_TYPES } from './solid-archive-state-action-types';
import { SOLID_BOARD_ACTION_TYPES } from './solid-board-action-types';
import { SOLID_EMBEDDED_TASK_ACTION_TYPES } from './solid-embedded-task-action-types';
import { SOLID_GLOBAL_CONFIG_ACTION_TYPES } from './solid-global-config-action-types';
import { SOLID_ISSUE_PROVIDER_ACTION_TYPES } from './solid-issue-provider-action-types';
import { SOLID_MENU_TREE_ACTION_TYPES } from './solid-menu-tree-action-types';
import { SOLID_METRIC_ACTION_TYPES } from './solid-metric-action-types';
import { SOLID_PLANNER_ACTION_TYPES } from './solid-planner-action-types';
import { SOLID_PLUGIN_DATA_ACTION_TYPES } from './solid-plugin-data-action-types';
import { SOLID_PROJECT_DELETE_ACTION_TYPES } from './solid-project-delete-action-types';
import { SOLID_PROJECT_TASK_ORDER_ACTION_TYPES } from './solid-project-task-order-action-types';
import { SOLID_SECTION_ACTION_TYPES } from './solid-section-action-types';
import { SOLID_SIMPLE_COUNTER_ACTION_TYPES } from './solid-simple-counter-action-types';
import { SOLID_TASK_ARCHIVE_LIFECYCLE_ACTION_TYPES } from './solid-task-archive-lifecycle-action-types';
import { SOLID_TASK_BATCH_ACTION_TYPES } from './solid-task-batch-action-types';
import { SOLID_TASK_DEADLINE_ACTION_TYPES } from './solid-task-deadline-action-types';
import { SOLID_TASK_PROJECT_MOVE_ACTION_TYPES } from './solid-task-project-move-action-types';
import { SOLID_TASK_REPEAT_CFG_ACTION_TYPES } from './solid-task-repeat-cfg-action-types';
import { SOLID_TASK_SCHEDULING_ACTION_TYPES } from './solid-task-scheduling-action-types';
import { SOLID_TASK_TAG_ACTION_TYPES } from './solid-task-tag-action-types';
import { SOLID_TIME_TRACKING_ACTION_TYPES } from './solid-time-tracking-action-types';
import { SOLID_TODAY_ACTION_TYPES } from './solid-today-action-types';
import { SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES } from './solid-work-context-action-types';

export type SolidPersistentActionOwnership =
  | 'solid-owned'
  | 'non-applicable'
  | 'deferred';

export const SOLID_OWNED_PERSISTENT_ACTION_TYPES = new Set<string>([
  ...SOLID_ARCHIVE_STATE_ACTION_TYPES,
  ...SOLID_BOARD_ACTION_TYPES,
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
  ...SOLID_PROJECT_DELETE_ACTION_TYPES,
  ...SOLID_EMBEDDED_TASK_ACTION_TYPES,
  ...SOLID_GLOBAL_CONFIG_ACTION_TYPES,
  ...SOLID_ISSUE_PROVIDER_ACTION_TYPES,
  ...SOLID_MENU_TREE_ACTION_TYPES,
  ...SOLID_METRIC_ACTION_TYPES,
  ...SOLID_PLANNER_ACTION_TYPES,
  ...SOLID_PLUGIN_DATA_ACTION_TYPES,
  ...SOLID_PROJECT_TASK_ORDER_ACTION_TYPES,
  ...SOLID_SECTION_ACTION_TYPES,
  ...SOLID_SIMPLE_COUNTER_ACTION_TYPES,
  ...SOLID_TASK_ARCHIVE_LIFECYCLE_ACTION_TYPES,
  ...SOLID_TASK_BATCH_ACTION_TYPES,
  ...SOLID_TASK_DEADLINE_ACTION_TYPES,
  ...SOLID_TASK_PROJECT_MOVE_ACTION_TYPES,
  ...SOLID_TASK_REPEAT_CFG_ACTION_TYPES,
  ...SOLID_TASK_SCHEDULING_ACTION_TYPES,
  ...SOLID_TASK_TAG_ACTION_TYPES,
  ...SOLID_TIME_TRACKING_ACTION_TYPES,
  ...SOLID_TODAY_ACTION_TYPES,
  ...SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES,
]);

export const SOLID_DEFERRED_PERSISTENT_ACTION_TYPES = new Set<string>();

export const SOLID_NON_APPLICABLE_PERSISTENT_ACTION_TYPES = new Set<string>([
  ...Object.values(ActionType).filter(
    (actionType) =>
      !SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(actionType) &&
      !SOLID_DEFERRED_PERSISTENT_ACTION_TYPES.has(actionType),
  ),
  TaskSharedActions.localRemoveOverdueFromToday.type,
]);

export const classifySolidPersistentActionType = (
  actionType: string,
): SolidPersistentActionOwnership | null => {
  if (SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(actionType)) {
    return 'solid-owned';
  }
  if (SOLID_NON_APPLICABLE_PERSISTENT_ACTION_TYPES.has(actionType)) {
    return 'non-applicable';
  }
  if (SOLID_DEFERRED_PERSISTENT_ACTION_TYPES.has(actionType)) {
    return 'deferred';
  }
  return null;
};
