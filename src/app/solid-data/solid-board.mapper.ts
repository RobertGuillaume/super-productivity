import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { BoardCfg } from '../features/boards/boards.model';
import {
  SOLID_PRODUCTIVITY_BOARDS_CONTAINER,
  SOLID_PRODUCTIVITY_BOARD_TYPE,
  SP_BOARD,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export interface SolidBoardRecord {
  board: BoardCfg;
  order: number;
}

export const boardToSolidCreateInput = (
  board: BoardCfg,
  profile: ThingWriteProfile,
  order = 0,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_BOARDS_CONTAINER,
    resourceName: board.id,
  },
  title: boardTitle(board),
  facets: {
    title: boardTitle(board),
    status: 'active',
  },
  properties: boardToSolidProperties(board, order),
});

export const boardToSolidChanges = (board: BoardCfg, order = 0): ThingChanges => ({
  title: boardTitle(board),
  status: 'active',
  replaceProperties: buildBoardSolidProperties(board, order),
});

export const boardToSolidProperties = (
  board: BoardCfg,
  order = 0,
): ThingRdfPropertyInput => buildBoardSolidProperties(board, order);

export const solidThingToBoardRecord = (thing: Thing): SolidBoardRecord => {
  const jsonBoard = jsonProp<BoardCfg>(thing, SP_BOARD.boardData);
  const board =
    jsonBoard ??
    ({
      id: stringProp(thing, SP_BOARD.id) ?? thing.uri,
      title: stringProp(thing, SP_BOARD.title) ?? 'Board',
      cols: numberProp(thing, SP_BOARD.cols) ?? 1,
      panels: jsonProp(thing, SP_BOARD.panels) ?? [],
    } as BoardCfg);

  return {
    board: {
      ...board,
      id: stringProp(thing, SP_BOARD.id) ?? board.id,
      title: stringProp(thing, SP_BOARD.title) ?? board.title,
      cols: numberProp(thing, SP_BOARD.cols) ?? board.cols,
      panels: jsonProp(thing, SP_BOARD.panels) ?? board.panels,
    },
    order: numberProp(thing, SP_BOARD.order) ?? 0,
  };
};

export const solidThingToBoard = (thing: Thing): BoardCfg =>
  solidThingToBoardRecord(thing).board;

export const solidBoardQuery = {
  type: SOLID_PRODUCTIVITY_BOARD_TYPE,
} as const;

const buildBoardSolidProperties = (
  board: BoardCfg,
  order: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_BOARD.id, board.id);
  addLiteral(properties, SP_BOARD.title, board.title);
  addLiteral(properties, SP_BOARD.cols, board.cols);
  addLiteral(properties, SP_BOARD.order, order);
  addJson(properties, SP_BOARD.panels, board.panels);
  addJson(properties, SP_BOARD.boardData, board);

  return properties;
};

const boardTitle = (board: BoardCfg): string => board.title.trim() || 'Board';
