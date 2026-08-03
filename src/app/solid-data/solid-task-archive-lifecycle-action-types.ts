import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskArchiveLifecycleAction =
  | ReturnType<typeof TaskSharedActions.moveToArchive>
  | ReturnType<typeof TaskSharedActions.restoreTask>
  | ReturnType<typeof TaskSharedActions.restoreDeletedTask>
  | ReturnType<typeof TaskSharedActions.convertToSubTask>
  | ReturnType<typeof TaskSharedActions.convertToMainTask>;

export const SOLID_TASK_ARCHIVE_LIFECYCLE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.moveToArchive.type,
  TaskSharedActions.restoreTask.type,
  TaskSharedActions.restoreDeletedTask.type,
  TaskSharedActions.convertToSubTask.type,
  TaskSharedActions.convertToMainTask.type,
]);

export const isSolidTaskArchiveLifecycleAction = (
  action: unknown,
): action is SolidTaskArchiveLifecycleAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_ARCHIVE_LIFECYCLE_ACTION_TYPES.has((action as { type: string }).type);
