import {
  deletePluginMetadata,
  deletePluginUserData,
  upsertPluginMetadata,
  upsertPluginUserData,
} from '../plugins/store/plugin.actions';

export type SolidPluginDataSaveAction =
  | ReturnType<typeof upsertPluginUserData>
  | ReturnType<typeof upsertPluginMetadata>;

export type SolidPluginDataDeleteAction =
  | ReturnType<typeof deletePluginUserData>
  | ReturnType<typeof deletePluginMetadata>;

export type SolidPluginDataAction =
  | SolidPluginDataSaveAction
  | SolidPluginDataDeleteAction;

export const SOLID_PLUGIN_DATA_SAVE_ACTION_TYPES = new Set<string>([
  upsertPluginUserData.type,
  upsertPluginMetadata.type,
]);

export const SOLID_PLUGIN_DATA_DELETE_ACTION_TYPES = new Set<string>([
  deletePluginUserData.type,
  deletePluginMetadata.type,
]);

export const SOLID_PLUGIN_DATA_ACTION_TYPES = new Set<string>([
  ...SOLID_PLUGIN_DATA_SAVE_ACTION_TYPES,
  ...SOLID_PLUGIN_DATA_DELETE_ACTION_TYPES,
]);

export const isSolidPluginDataSaveAction = (
  action: unknown,
): action is SolidPluginDataSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PLUGIN_DATA_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidPluginDataDeleteAction = (
  action: unknown,
): action is SolidPluginDataDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PLUGIN_DATA_DELETE_ACTION_TYPES.has((action as { type: string }).type);
