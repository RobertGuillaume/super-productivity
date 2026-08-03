import {
  addTaskRepeatCfgToTask,
  deleteTaskRepeatCfg,
  deleteTaskRepeatCfgInstance,
  deleteTaskRepeatCfgs,
  updateTaskRepeatCfg,
  updateTaskRepeatCfgs,
} from '../features/task-repeat-cfg/store/task-repeat-cfg.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskRepeatCfgSaveAction =
  | ReturnType<typeof addTaskRepeatCfgToTask>
  | ReturnType<typeof updateTaskRepeatCfg>
  | ReturnType<typeof updateTaskRepeatCfgs>
  | ReturnType<typeof deleteTaskRepeatCfgInstance>;

export type SolidTaskRepeatCfgDeleteAction =
  | ReturnType<typeof deleteTaskRepeatCfg>
  | ReturnType<typeof deleteTaskRepeatCfgs>
  | ReturnType<typeof TaskSharedActions.deleteTaskRepeatCfg>;

export type SolidTaskRepeatCfgAction =
  | SolidTaskRepeatCfgSaveAction
  | SolidTaskRepeatCfgDeleteAction;

export const SOLID_TASK_REPEAT_CFG_SAVE_ACTION_TYPES = new Set<string>([
  addTaskRepeatCfgToTask.type,
  updateTaskRepeatCfg.type,
  updateTaskRepeatCfgs.type,
  deleteTaskRepeatCfgInstance.type,
]);

export const SOLID_TASK_REPEAT_CFG_DELETE_ACTION_TYPES = new Set<string>([
  deleteTaskRepeatCfg.type,
  deleteTaskRepeatCfgs.type,
  TaskSharedActions.deleteTaskRepeatCfg.type,
]);

export const SOLID_TASK_REPEAT_CFG_ACTION_TYPES = new Set<string>([
  ...SOLID_TASK_REPEAT_CFG_SAVE_ACTION_TYPES,
  ...SOLID_TASK_REPEAT_CFG_DELETE_ACTION_TYPES,
]);

export const isSolidTaskRepeatCfgSaveAction = (
  action: unknown,
): action is SolidTaskRepeatCfgSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_REPEAT_CFG_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidTaskRepeatCfgDeleteAction = (
  action: unknown,
): action is SolidTaskRepeatCfgDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_REPEAT_CFG_DELETE_ACTION_TYPES.has((action as { type: string }).type);
