import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTodayTaskPlanAction = ReturnType<
  typeof TaskSharedActions.planTasksForToday
>;

export type SolidTodayTagOrderAction =
  | ReturnType<typeof TaskSharedActions.removeTasksFromTodayTag>
  | ReturnType<typeof TaskSharedActions.moveTaskInTodayTagList>;

export const SOLID_TODAY_ACTION_TYPES = new Set<string>([
  TaskSharedActions.planTasksForToday.type,
  TaskSharedActions.removeTasksFromTodayTag.type,
  TaskSharedActions.moveTaskInTodayTagList.type,
]);

export const isSolidTodayTaskPlanAction = (
  action: unknown,
): action is SolidTodayTaskPlanAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  action.type === TaskSharedActions.planTasksForToday.type;

export const isSolidTodayTagOrderAction = (
  action: unknown,
): action is SolidTodayTagOrderAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  (action.type === TaskSharedActions.removeTasksFromTodayTag.type ||
    action.type === TaskSharedActions.moveTaskInTodayTagList.type);
