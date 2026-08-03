import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskDeadlineAction =
  | ReturnType<typeof TaskSharedActions.setDeadline>
  | ReturnType<typeof TaskSharedActions.planDeadlineTasksForToday>
  | ReturnType<typeof TaskSharedActions.removeDeadline>
  | ReturnType<typeof TaskSharedActions.clearDeadlineReminder>;

export const SOLID_TASK_DEADLINE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.setDeadline.type,
  TaskSharedActions.planDeadlineTasksForToday.type,
  TaskSharedActions.removeDeadline.type,
  TaskSharedActions.clearDeadlineReminder.type,
]);

export const isSolidTaskDeadlineAction = (
  action: unknown,
): action is SolidTaskDeadlineAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_DEADLINE_ACTION_TYPES.has((action as { type: string }).type);
