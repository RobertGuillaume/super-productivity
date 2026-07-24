import {
  moveTaskDownInTodayList,
  moveTaskInTodayList,
  moveTaskToBottomInTodayList,
  moveTaskToTopInTodayList,
  moveTaskUpInTodayList,
} from '../features/work-context/store/work-context-meta.actions';

export type SolidWorkContextMoveAction =
  | ReturnType<typeof moveTaskInTodayList>
  | ReturnType<typeof moveTaskUpInTodayList>
  | ReturnType<typeof moveTaskDownInTodayList>
  | ReturnType<typeof moveTaskToTopInTodayList>
  | ReturnType<typeof moveTaskToBottomInTodayList>;

export const SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES = new Set<string>([
  moveTaskInTodayList.type,
  moveTaskUpInTodayList.type,
  moveTaskDownInTodayList.type,
  moveTaskToTopInTodayList.type,
  moveTaskToBottomInTodayList.type,
]);

export const isSolidWorkContextMoveAction = (
  action: unknown,
): action is SolidWorkContextMoveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_WORK_CONTEXT_MOVE_ACTION_TYPES.has((action as { type: string }).type);
