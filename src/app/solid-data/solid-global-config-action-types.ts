import { updateGlobalConfigSection } from '../features/config/store/global-config.actions';

export type SolidGlobalConfigSaveAction = ReturnType<typeof updateGlobalConfigSection>;

export const SOLID_GLOBAL_CONFIG_ACTION_TYPES = new Set<string>([
  updateGlobalConfigSection.type,
]);

export const isSolidGlobalConfigSaveAction = (
  action: unknown,
): action is SolidGlobalConfigSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_GLOBAL_CONFIG_ACTION_TYPES.has((action as { type: string }).type);
