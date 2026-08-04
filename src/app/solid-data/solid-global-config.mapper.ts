import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { GlobalConfigState } from '../features/config/global-config.model';
import {
  SOLID_PRODUCTIVITY_CONFIG_CONTAINER,
  SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
  SP_GLOBAL_CONFIG,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const SOLID_GLOBAL_CONFIG_ID = 'global-config';

export interface SolidGlobalConfig {
  id: typeof SOLID_GLOBAL_CONFIG_ID;
  config: GlobalConfigState;
  updated: number;
}

export const globalConfigToSolidCreateInput = (
  config: GlobalConfigState,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_CONFIG_CONTAINER,
    resourceName: SOLID_GLOBAL_CONFIG_ID,
  },
  title: 'Global config',
  facets: {
    title: 'Global config',
    status: 'active',
  },
  properties: globalConfigToSolidProperties(config, updated),
});

export const globalConfigToSolidChanges = (
  config: GlobalConfigState,
  updated = Date.now(),
): ThingChanges => ({
  title: 'Global config',
  status: 'active',
  replaceProperties: buildGlobalConfigSolidProperties(config, updated),
});

export const globalConfigToSolidProperties = (
  config: GlobalConfigState,
  updated = Date.now(),
): ThingRdfPropertyInput => buildGlobalConfigSolidProperties(config, updated);

export const solidThingToGlobalConfig = (thing: Thing): SolidGlobalConfig | null => {
  const config = jsonProp<GlobalConfigState>(thing, SP_GLOBAL_CONFIG.configData);
  if (!config) {
    return null;
  }

  return {
    id:
      (stringProp(thing, SP_GLOBAL_CONFIG.id) as typeof SOLID_GLOBAL_CONFIG_ID) ??
      SOLID_GLOBAL_CONFIG_ID,
    config,
    updated: numberProp(thing, SP_GLOBAL_CONFIG.updated) ?? 0,
  };
};

export const solidGlobalConfigQuery = {
  type: SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
} as const;

const buildGlobalConfigSolidProperties = (
  config: GlobalConfigState,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_GLOBAL_CONFIG.id, SOLID_GLOBAL_CONFIG_ID);
  addLiteral(properties, SP_GLOBAL_CONFIG.updated, updated);
  addJson(properties, SP_GLOBAL_CONFIG.configData, config);

  return properties;
};
