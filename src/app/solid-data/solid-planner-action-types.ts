import { PlannerActions } from '../features/planner/store/planner.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidPlannerAction =
  | ReturnType<typeof PlannerActions.upsertPlannerDay>
  | ReturnType<typeof PlannerActions.transferTask>
  | ReturnType<typeof PlannerActions.moveInList>
  | ReturnType<typeof PlannerActions.moveBeforeTask>
  | ReturnType<typeof PlannerActions.planTaskForDay>
  | ReturnType<typeof TaskSharedActions.scheduleTaskWithTime>
  | ReturnType<typeof TaskSharedActions.unscheduleTask>;

export const SOLID_PLANNER_ACTION_TYPES = new Set<string>([
  PlannerActions.upsertPlannerDay.type,
  PlannerActions.transferTask.type,
  PlannerActions.moveInList.type,
  PlannerActions.moveBeforeTask.type,
  PlannerActions.planTaskForDay.type,
  TaskSharedActions.scheduleTaskWithTime.type,
  TaskSharedActions.unscheduleTask.type,
]);

export const isSolidPlannerAction = (action: unknown): action is SolidPlannerAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PLANNER_ACTION_TYPES.has((action as { type: string }).type);
