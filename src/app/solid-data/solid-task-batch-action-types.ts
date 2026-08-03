import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskBatchAction =
  | ReturnType<typeof TaskSharedActions.applyShortSyntax>
  | ReturnType<typeof TaskSharedActions.batchUpdateForProject>;

export const SOLID_TASK_BATCH_ACTION_TYPES = new Set<string>([
  TaskSharedActions.applyShortSyntax.type,
  TaskSharedActions.batchUpdateForProject.type,
]);

export const isSolidTaskBatchAction = (action: unknown): action is SolidTaskBatchAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_BATCH_ACTION_TYPES.has((action as { type: string }).type);
