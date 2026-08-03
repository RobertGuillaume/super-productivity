import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  SOLID_PRODUCTIVITY_APP_CONTAINER,
  SOLID_PRODUCTIVITY_APP_STATE_TYPE,
  SP_APP_STATE,
} from './solid-productivity-vocab';
import {
  addArray,
  addLiteral,
  numberProp,
  SolidRdfPropertyMap,
  stringArrayProp,
} from './solid-rdf.mapper-helpers';

export interface SolidAppState {
  id: typeof SOLID_APP_STATE_ID;
  projectOrder: string[];
  tagOrder: string[];
  noteTodayOrder: string[];
  sectionOrder: string[];
  updated: number;
}

export const SOLID_APP_STATE_ID = 'super-productivity-app-state';
export const SOLID_APP_STATE_RESOURCE_NAME = 'state';

export const solidAppStateQuery = {
  type: SOLID_PRODUCTIVITY_APP_STATE_TYPE,
} as const;

export const createEmptySolidAppState = (): SolidAppState => ({
  id: SOLID_APP_STATE_ID,
  projectOrder: [],
  tagOrder: [],
  noteTodayOrder: [],
  sectionOrder: [],
  updated: Date.now(),
});

export const appStateToSolidCreateInput = (
  appState: SolidAppState,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_APP_CONTAINER,
    resourceName: SOLID_APP_STATE_RESOURCE_NAME,
  },
  title: 'Super Productivity app state',
  facets: {
    title: 'Super Productivity app state',
    status: 'active',
  },
  properties: appStateToSolidProperties(appState),
});

export const appStateToSolidChanges = (appState: SolidAppState): ThingChanges => ({
  title: 'Super Productivity app state',
  status: 'active',
  replaceProperties: buildAppStateSolidProperties(appState),
});

export const appStateToSolidProperties = (
  appState: SolidAppState,
): ThingRdfPropertyInput => buildAppStateSolidProperties(appState);

export const solidThingToAppState = (thing: Thing): SolidAppState => ({
  id: SOLID_APP_STATE_ID,
  projectOrder: stringArrayProp(thing, SP_APP_STATE.projectOrder),
  tagOrder: stringArrayProp(thing, SP_APP_STATE.tagOrder),
  noteTodayOrder: stringArrayProp(thing, SP_APP_STATE.noteTodayOrder),
  sectionOrder: stringArrayProp(thing, SP_APP_STATE.sectionOrder),
  updated: numberProp(thing, SP_APP_STATE.updated) ?? 0,
});

const buildAppStateSolidProperties = (appState: SolidAppState): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_APP_STATE.id, appState.id);
  addArray(properties, SP_APP_STATE.projectOrder, appState.projectOrder, {
    includeEmpty: true,
  });
  addArray(properties, SP_APP_STATE.tagOrder, appState.tagOrder, {
    includeEmpty: true,
  });
  addArray(properties, SP_APP_STATE.noteTodayOrder, appState.noteTodayOrder, {
    includeEmpty: true,
  });
  addArray(properties, SP_APP_STATE.sectionOrder, appState.sectionOrder, {
    includeEmpty: true,
  });
  addLiteral(properties, SP_APP_STATE.updated, appState.updated);

  return properties;
};
