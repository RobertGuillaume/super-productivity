import {
  moveAllProjectBacklogTasksToRegularList,
  moveProjectTaskDownInBacklogList,
  moveProjectTaskInBacklogList,
  moveProjectTaskToBacklogList,
  moveProjectTaskToBacklogListAuto,
  moveProjectTaskToBottomInBacklogList,
  moveProjectTaskToRegularList,
  moveProjectTaskToRegularListAuto,
  moveProjectTaskToTopInBacklogList,
  moveProjectTaskUpInBacklogList,
} from '../features/project/store/project.actions';

export type SolidProjectTaskOrderAction =
  | ReturnType<typeof moveAllProjectBacklogTasksToRegularList>
  | ReturnType<typeof moveProjectTaskDownInBacklogList>
  | ReturnType<typeof moveProjectTaskInBacklogList>
  | ReturnType<typeof moveProjectTaskToBacklogList>
  | ReturnType<typeof moveProjectTaskToBacklogListAuto>
  | ReturnType<typeof moveProjectTaskToBottomInBacklogList>
  | ReturnType<typeof moveProjectTaskToRegularList>
  | ReturnType<typeof moveProjectTaskToRegularListAuto>
  | ReturnType<typeof moveProjectTaskToTopInBacklogList>
  | ReturnType<typeof moveProjectTaskUpInBacklogList>;

export const SOLID_PROJECT_TASK_ORDER_ACTION_TYPES = new Set<string>([
  moveAllProjectBacklogTasksToRegularList.type,
  moveProjectTaskDownInBacklogList.type,
  moveProjectTaskInBacklogList.type,
  moveProjectTaskToBacklogList.type,
  moveProjectTaskToBacklogListAuto.type,
  moveProjectTaskToBottomInBacklogList.type,
  moveProjectTaskToRegularList.type,
  moveProjectTaskToRegularListAuto.type,
  moveProjectTaskToTopInBacklogList.type,
  moveProjectTaskUpInBacklogList.type,
]);

export const isSolidProjectTaskOrderAction = (
  action: unknown,
): action is SolidProjectTaskOrderAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PROJECT_TASK_ORDER_ACTION_TYPES.has((action as { type: string }).type);

export const projectIdForSolidProjectTaskOrderAction = (
  action: SolidProjectTaskOrderAction,
): string => ('projectId' in action ? action.projectId : action.workContextId);
