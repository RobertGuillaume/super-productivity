import {
  addBoard,
  removeBoard,
  sortBoards,
  updateBoard,
  updatePanelCfgTaskIds,
} from '../features/boards/store/boards.actions';

export type SolidBoardSaveAction =
  | ReturnType<typeof addBoard>
  | ReturnType<typeof updateBoard>
  | ReturnType<typeof sortBoards>
  | ReturnType<typeof updatePanelCfgTaskIds>;

export type SolidBoardDeleteAction = ReturnType<typeof removeBoard>;

export type SolidBoardAction = SolidBoardSaveAction | SolidBoardDeleteAction;

export const SOLID_BOARD_SAVE_ACTION_TYPES = new Set<string>([
  addBoard.type,
  updateBoard.type,
  sortBoards.type,
  updatePanelCfgTaskIds.type,
]);

export const SOLID_BOARD_DELETE_ACTION_TYPES = new Set<string>([removeBoard.type]);

export const SOLID_BOARD_ACTION_TYPES = new Set<string>([
  ...SOLID_BOARD_SAVE_ACTION_TYPES,
  ...SOLID_BOARD_DELETE_ACTION_TYPES,
]);

export const isSolidBoardSaveAction = (action: unknown): action is SolidBoardSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_BOARD_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidBoardDeleteAction = (
  action: unknown,
): action is SolidBoardDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_BOARD_DELETE_ACTION_TYPES.has((action as { type: string }).type);
