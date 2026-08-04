import {
  archiveOperationHandled,
  compressArchive,
  flushYoungToOld,
} from '../features/archive/store/archive.actions';
import { deleteTag, deleteTags } from '../features/tag/store/tag.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidArchiveStateImmediateAction =
  | ReturnType<typeof TaskSharedActions.moveToArchive>
  | ReturnType<typeof flushYoungToOld>;

export type SolidArchiveStateMaintenanceSourceAction =
  | ReturnType<typeof compressArchive>
  | ReturnType<typeof TaskSharedActions.deleteProject>
  | ReturnType<typeof deleteTag>
  | ReturnType<typeof deleteTags>
  | ReturnType<typeof TaskSharedActions.deleteTaskRepeatCfg>
  | ReturnType<typeof TaskSharedActions.deleteIssueProvider>
  | ReturnType<typeof TaskSharedActions.deleteIssueProviders>;

export type SolidArchiveStateHandledAction = ReturnType<
  typeof archiveOperationHandled
> & {
  sourceAction: SolidArchiveStateMaintenanceSourceAction;
};

export type SolidArchiveStateAction =
  | SolidArchiveStateImmediateAction
  | SolidArchiveStateMaintenanceSourceAction;

export type SolidArchiveStatePersistenceTrigger =
  | SolidArchiveStateImmediateAction
  | SolidArchiveStateHandledAction;

export const SOLID_ARCHIVE_STATE_IMMEDIATE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.moveToArchive.type,
  flushYoungToOld.type,
]);

export const SOLID_ARCHIVE_STATE_MAINTENANCE_SOURCE_ACTION_TYPES = new Set<string>([
  compressArchive.type,
  TaskSharedActions.deleteProject.type,
  deleteTag.type,
  deleteTags.type,
  TaskSharedActions.deleteTaskRepeatCfg.type,
  TaskSharedActions.deleteIssueProvider.type,
  TaskSharedActions.deleteIssueProviders.type,
]);

export const SOLID_ARCHIVE_STATE_ACTION_TYPES = new Set<string>([
  ...SOLID_ARCHIVE_STATE_IMMEDIATE_ACTION_TYPES,
  ...SOLID_ARCHIVE_STATE_MAINTENANCE_SOURCE_ACTION_TYPES,
]);

export const isSolidArchiveStateImmediateAction = (
  action: unknown,
): action is SolidArchiveStateImmediateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_ARCHIVE_STATE_IMMEDIATE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidArchiveStateHandledAction = (
  action: unknown,
): action is SolidArchiveStateHandledAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  (action as { type: string }).type === archiveOperationHandled.type &&
  'sourceAction' in action &&
  typeof (action as { sourceAction?: { type?: unknown } }).sourceAction?.type ===
    'string' &&
  SOLID_ARCHIVE_STATE_MAINTENANCE_SOURCE_ACTION_TYPES.has(
    (action as { sourceAction: { type: string } }).sourceAction.type,
  );

export const isSolidArchiveStatePersistenceTrigger = (
  action: unknown,
): action is SolidArchiveStatePersistenceTrigger =>
  isSolidArchiveStateImmediateAction(action) || isSolidArchiveStateHandledAction(action);

export const solidArchiveStateSourceAction = (
  action: SolidArchiveStatePersistenceTrigger,
): SolidArchiveStateAction =>
  isSolidArchiveStateHandledAction(action) ? action.sourceAction : action;
