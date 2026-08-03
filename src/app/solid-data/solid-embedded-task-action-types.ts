import { syncTimeSpent } from '../features/time-tracking/store/time-tracking.actions';
import {
  __updateMultipleTaskSimple,
  addSubTask,
  moveSubTask,
  moveSubTaskDown,
  moveSubTaskToBottom,
  moveSubTaskToTop,
  moveSubTaskUp,
  removeTimeSpent,
  roundTimeSpentForDay,
  updateTaskUi,
} from '../features/tasks/store/task.actions';
import {
  addTaskAttachment,
  deleteTaskAttachment,
  updateTaskAttachment,
} from '../features/tasks/task-attachment/task-attachment.actions';

export type SolidEmbeddedTaskAction =
  | ReturnType<typeof __updateMultipleTaskSimple>
  | ReturnType<typeof updateTaskUi>
  | ReturnType<typeof moveSubTask>
  | ReturnType<typeof moveSubTaskUp>
  | ReturnType<typeof moveSubTaskDown>
  | ReturnType<typeof moveSubTaskToTop>
  | ReturnType<typeof moveSubTaskToBottom>
  | ReturnType<typeof removeTimeSpent>
  | ReturnType<typeof addSubTask>
  | ReturnType<typeof roundTimeSpentForDay>
  | ReturnType<typeof addTaskAttachment>
  | ReturnType<typeof updateTaskAttachment>
  | ReturnType<typeof deleteTaskAttachment>
  | ReturnType<typeof syncTimeSpent>;

export const SOLID_EMBEDDED_TASK_ACTION_TYPES = new Set<string>([
  __updateMultipleTaskSimple.type,
  updateTaskUi.type,
  moveSubTask.type,
  moveSubTaskUp.type,
  moveSubTaskDown.type,
  moveSubTaskToTop.type,
  moveSubTaskToBottom.type,
  removeTimeSpent.type,
  addSubTask.type,
  roundTimeSpentForDay.type,
  addTaskAttachment.type,
  updateTaskAttachment.type,
  deleteTaskAttachment.type,
  syncTimeSpent.type,
]);

export const isSolidEmbeddedTaskAction = (
  action: unknown,
): action is SolidEmbeddedTaskAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_EMBEDDED_TASK_ACTION_TYPES.has((action as { type: string }).type);
