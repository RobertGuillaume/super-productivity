import {
  addSection,
  addTaskToSection,
  deleteSection,
  removeTaskFromSection,
  updateSection,
  updateSectionOrder,
} from '../features/section/store/section.actions';
import { ActionType } from '../op-log/core/operation.types';

export type SolidSectionCreateAction = ReturnType<typeof addSection>;
export type SolidSectionDeleteAction = ReturnType<typeof deleteSection>;
export type SolidSectionUpdateAction =
  | ReturnType<typeof updateSection>
  | ReturnType<typeof addTaskToSection>
  | ReturnType<typeof removeTaskFromSection>;
export type SolidSectionOrderAction = ReturnType<typeof updateSectionOrder>;
export type SolidSectionWorkContextAction = ReturnType<typeof removeTaskFromSection>;

export type SolidSectionAction =
  | SolidSectionCreateAction
  | SolidSectionDeleteAction
  | SolidSectionUpdateAction
  | SolidSectionOrderAction;

export const SOLID_SECTION_CREATE_ACTION_TYPES = new Set<string>([
  ActionType.SECTION_ADD,
]);

export const SOLID_SECTION_UPDATE_ACTION_TYPES = new Set<string>([
  ActionType.SECTION_UPDATE,
  ActionType.SECTION_ADD_TASK,
  ActionType.SECTION_REMOVE_TASK,
]);

export const SOLID_SECTION_DELETE_ACTION_TYPES = new Set<string>([
  ActionType.SECTION_DELETE,
]);

export const SOLID_SECTION_ORDER_ACTION_TYPES = new Set<string>([
  ActionType.SECTION_UPDATE_ORDER,
]);

export const SOLID_SECTION_WORK_CONTEXT_ACTION_TYPES = new Set<string>([
  ActionType.SECTION_REMOVE_TASK,
]);

export const SOLID_SECTION_ACTION_TYPES = new Set<string>([
  ...SOLID_SECTION_CREATE_ACTION_TYPES,
  ...SOLID_SECTION_UPDATE_ACTION_TYPES,
  ...SOLID_SECTION_DELETE_ACTION_TYPES,
  ...SOLID_SECTION_ORDER_ACTION_TYPES,
]);

export const isSolidSectionCreateAction = (
  action: unknown,
): action is SolidSectionCreateAction =>
  hasActionType(action, SOLID_SECTION_CREATE_ACTION_TYPES);

export const isSolidSectionUpdateAction = (
  action: unknown,
): action is SolidSectionUpdateAction =>
  hasActionType(action, SOLID_SECTION_UPDATE_ACTION_TYPES);

export const isSolidSectionDeleteAction = (
  action: unknown,
): action is SolidSectionDeleteAction =>
  hasActionType(action, SOLID_SECTION_DELETE_ACTION_TYPES);

export const isSolidSectionOrderAction = (
  action: unknown,
): action is SolidSectionOrderAction =>
  hasActionType(action, SOLID_SECTION_ORDER_ACTION_TYPES);

export const isSolidSectionWorkContextAction = (
  action: unknown,
): action is SolidSectionWorkContextAction =>
  hasActionType(action, SOLID_SECTION_WORK_CONTEXT_ACTION_TYPES);

const hasActionType = (action: unknown, actionTypes: ReadonlySet<string>): boolean =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  actionTypes.has((action as { type: string }).type);
