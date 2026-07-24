import { getEnvOptional } from '../util/env';

export const SOLID_DATA_LAYER_ENABLED_STORAGE_KEY = 'SUP_SOLID_DATA_LAYER_ENABLED';
export const SOLID_DATA_LAYER_ENABLED_ENV_KEY = 'SP_SOLID_DATA_LAYER_ENABLED';

export const isSolidDataLayerEnabled = (): boolean => {
  const envValue = getEnvOptional(SOLID_DATA_LAYER_ENABLED_ENV_KEY);
  if (isEnabledValue(envValue)) {
    return true;
  }

  if (typeof localStorage === 'undefined') {
    return false;
  }

  return isEnabledValue(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY));
};

const isEnabledValue = (value: string | null | undefined): boolean =>
  value === '1' || value === 'true';
