import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskProjectMoveAction = ReturnType<
  typeof TaskSharedActions.moveToOtherProject
>;

export const SOLID_TASK_PROJECT_MOVE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.moveToOtherProject.type,
]);

export const isSolidTaskProjectMoveAction = (
  action: unknown,
): action is SolidTaskProjectMoveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_PROJECT_MOVE_ACTION_TYPES.has((action as { type: string }).type);
