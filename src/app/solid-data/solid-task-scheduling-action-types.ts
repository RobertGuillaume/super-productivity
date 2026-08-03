import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskSchedulingAction =
  | ReturnType<typeof TaskSharedActions.scheduleTaskWithTime>
  | ReturnType<typeof TaskSharedActions.reScheduleTaskWithTime>
  | ReturnType<typeof TaskSharedActions.unscheduleTask>
  | ReturnType<typeof TaskSharedActions.dismissReminderOnly>;

export const SOLID_TASK_SCHEDULING_ACTION_TYPES = new Set<string>([
  TaskSharedActions.scheduleTaskWithTime.type,
  TaskSharedActions.reScheduleTaskWithTime.type,
  TaskSharedActions.unscheduleTask.type,
  TaskSharedActions.dismissReminderOnly.type,
]);

export const isSolidTaskSchedulingAction = (
  action: unknown,
): action is SolidTaskSchedulingAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_SCHEDULING_ACTION_TYPES.has((action as { type: string }).type);
