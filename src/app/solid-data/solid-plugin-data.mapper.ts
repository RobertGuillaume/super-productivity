import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import {
  SOLID_PRODUCTIVITY_PLUGIN_METADATA_CONTAINER,
  SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE,
  SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_CONTAINER,
  SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE,
  SP_PLUGIN_METADATA,
  SP_PLUGIN_USER_DATA,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  booleanProp,
  jsonProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const pluginUserDataResourceName = (id: string): string =>
  `plugin-user-data-${id}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

export const pluginMetadataResourceName = (id: string): string =>
  `plugin-metadata-${id}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

export const pluginUserDataToSolidCreateInput = (
  pluginUserData: PluginUserData,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_CONTAINER,
    resourceName: pluginUserDataResourceName(pluginUserData.id),
  },
  title: pluginUserDataTitle(pluginUserData.id),
  facets: {
    title: pluginUserDataTitle(pluginUserData.id),
    status: 'active',
  },
  properties: pluginUserDataToSolidProperties(pluginUserData, updated),
});

export const pluginUserDataToSolidChanges = (
  pluginUserData: PluginUserData,
  updated = Date.now(),
): ThingChanges => ({
  title: pluginUserDataTitle(pluginUserData.id),
  status: 'active',
  replaceProperties: buildPluginUserDataSolidProperties(pluginUserData, updated),
});

export const pluginUserDataToSolidProperties = (
  pluginUserData: PluginUserData,
  updated = Date.now(),
): ThingRdfPropertyInput => buildPluginUserDataSolidProperties(pluginUserData, updated);

export const solidThingToPluginUserData = (thing: Thing): PluginUserData | null => {
  const userData = jsonProp<PluginUserData>(thing, SP_PLUGIN_USER_DATA.userData);
  const id = stringProp(thing, SP_PLUGIN_USER_DATA.id) ?? userData?.id;
  const data = stringProp(thing, SP_PLUGIN_USER_DATA.data) ?? userData?.data;

  if (!id || data === undefined) {
    return null;
  }

  return {
    id,
    data,
  };
};

export const pluginMetadataToSolidCreateInput = (
  pluginMetadata: PluginMetadata,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_PLUGIN_METADATA_CONTAINER,
    resourceName: pluginMetadataResourceName(pluginMetadata.id),
  },
  title: pluginMetadataTitle(pluginMetadata.id),
  facets: {
    title: pluginMetadataTitle(pluginMetadata.id),
    status: pluginMetadata.isEnabled ? 'active' : 'disabled',
  },
  properties: pluginMetadataToSolidProperties(pluginMetadata, updated),
});

export const pluginMetadataToSolidChanges = (
  pluginMetadata: PluginMetadata,
  updated = Date.now(),
): ThingChanges => ({
  title: pluginMetadataTitle(pluginMetadata.id),
  status: pluginMetadata.isEnabled ? 'active' : 'disabled',
  replaceProperties: buildPluginMetadataSolidProperties(pluginMetadata, updated),
});

export const pluginMetadataToSolidProperties = (
  pluginMetadata: PluginMetadata,
  updated = Date.now(),
): ThingRdfPropertyInput => buildPluginMetadataSolidProperties(pluginMetadata, updated);

export const solidThingToPluginMetadata = (thing: Thing): PluginMetadata | null => {
  const metadata = jsonProp<PluginMetadata>(thing, SP_PLUGIN_METADATA.metadataData);
  const id = stringProp(thing, SP_PLUGIN_METADATA.id) ?? metadata?.id;
  const isEnabled =
    booleanProp(thing, SP_PLUGIN_METADATA.isEnabled) ?? metadata?.isEnabled;

  if (!id || isEnabled === undefined) {
    return null;
  }

  return {
    ...metadata,
    id,
    isEnabled,
  };
};

export const solidPluginUserDataQuery = {
  type: SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE,
} as const;

export const solidPluginMetadataQuery = {
  type: SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE,
} as const;

const buildPluginUserDataSolidProperties = (
  pluginUserData: PluginUserData,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_PLUGIN_USER_DATA.id, pluginUserData.id);
  addLiteral(properties, SP_PLUGIN_USER_DATA.data, pluginUserData.data);
  addLiteral(properties, SP_PLUGIN_USER_DATA.updated, updated);
  addJson(properties, SP_PLUGIN_USER_DATA.userData, pluginUserData);

  return properties;
};

const buildPluginMetadataSolidProperties = (
  pluginMetadata: PluginMetadata,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_PLUGIN_METADATA.id, pluginMetadata.id);
  addLiteral(properties, SP_PLUGIN_METADATA.isEnabled, pluginMetadata.isEnabled);
  addLiteral(properties, SP_PLUGIN_METADATA.updated, updated);
  addJson(properties, SP_PLUGIN_METADATA.metadataData, pluginMetadata);

  return properties;
};

const pluginUserDataTitle = (id: string): string => `Plugin user data ${id}`;

const pluginMetadataTitle = (id: string): string => `Plugin metadata ${id}`;
