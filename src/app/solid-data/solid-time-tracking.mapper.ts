import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  TimeTrackingState,
  TTWorkContextData,
} from '../features/time-tracking/time-tracking.model';
import {
  SOLID_PRODUCTIVITY_TIME_TRACKING_CONTAINER,
  SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE,
  SP_TIME_TRACKING,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export type SolidTimeTrackingContextType = 'PROJECT' | 'TAG';

export interface SolidTimeTrackingEntry {
  id: string;
  contextType: SolidTimeTrackingContextType;
  contextId: string;
  date: string;
  data: TTWorkContextData;
  updated: number;
}

export const timeTrackingEntryId = (
  contextType: SolidTimeTrackingContextType,
  contextId: string,
  date: string,
): string => `${contextType}:${contextId}:${date}`;

export const timeTrackingEntryResourceName = (
  contextType: SolidTimeTrackingContextType,
  contextId: string,
  date: string,
): string =>
  `time-tracking-${contextType.toLowerCase()}-${contextId}-${date}`
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const timeTrackingEntryToSolidCreateInput = (
  entry: SolidTimeTrackingEntry,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_TIME_TRACKING_CONTAINER,
    resourceName: timeTrackingEntryResourceName(
      entry.contextType,
      entry.contextId,
      entry.date,
    ),
  },
  title: `${entry.contextType} ${entry.contextId} ${entry.date}`,
  facets: {
    title: `${entry.contextType} ${entry.contextId} ${entry.date}`,
    status: 'active',
  },
  properties: timeTrackingEntryToSolidProperties(entry, updated),
});

export const timeTrackingEntryToSolidChanges = (
  entry: SolidTimeTrackingEntry,
  updated = Date.now(),
): ThingChanges => ({
  title: `${entry.contextType} ${entry.contextId} ${entry.date}`,
  status: 'active',
  replaceProperties: buildTimeTrackingSolidProperties(entry, updated),
});

export const timeTrackingEntryToSolidProperties = (
  entry: SolidTimeTrackingEntry,
  updated = Date.now(),
): ThingRdfPropertyInput => buildTimeTrackingSolidProperties(entry, updated);

export const solidThingToTimeTrackingEntry = (
  thing: Thing,
): SolidTimeTrackingEntry | null => {
  const contextType = stringProp(
    thing,
    SP_TIME_TRACKING.contextType,
  ) as SolidTimeTrackingContextType | null;
  const contextId = stringProp(thing, SP_TIME_TRACKING.contextId);
  const date = stringProp(thing, SP_TIME_TRACKING.date);
  const data = jsonProp<TTWorkContextData>(thing, SP_TIME_TRACKING.data);

  if (!contextType || !contextId || !date || !data) {
    return null;
  }

  return {
    id:
      stringProp(thing, SP_TIME_TRACKING.id) ??
      timeTrackingEntryId(contextType, contextId, date),
    contextType,
    contextId,
    date,
    data,
    updated: numberProp(thing, SP_TIME_TRACKING.updated) ?? 0,
  };
};

export const timeTrackingStateToEntries = (
  state: TimeTrackingState,
): SolidTimeTrackingEntry[] => [
  ...entriesForContextType('PROJECT', state.project),
  ...entriesForContextType('TAG', state.tag),
];

export const timeTrackingEntriesToState = (
  entries: readonly SolidTimeTrackingEntry[],
): TimeTrackingState =>
  entries.reduce(
    (state, entry) => {
      const collection = entry.contextType === 'TAG' ? state.tag : state.project;
      collection[entry.contextId] = {
        ...(collection[entry.contextId] ?? {}),
        [entry.date]: entry.data,
      };
      return state;
    },
    {
      project: {},
      tag: {},
    } as TimeTrackingState,
  );

export const solidTimeTrackingQuery = {
  type: SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE,
} as const;

const entriesForContextType = (
  contextType: SolidTimeTrackingContextType,
  contexts: TimeTrackingState['project'],
): SolidTimeTrackingEntry[] =>
  Object.entries(contexts).flatMap(([contextId, dateMap]) =>
    Object.entries(dateMap).map(([date, data]) => ({
      id: timeTrackingEntryId(contextType, contextId, date),
      contextType,
      contextId,
      date,
      data,
      updated: Date.now(),
    })),
  );

const buildTimeTrackingSolidProperties = (
  entry: SolidTimeTrackingEntry,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_TIME_TRACKING.id, entry.id);
  addLiteral(properties, SP_TIME_TRACKING.contextType, entry.contextType);
  addLiteral(properties, SP_TIME_TRACKING.contextId, entry.contextId);
  addLiteral(properties, SP_TIME_TRACKING.date, entry.date);
  addLiteral(properties, SP_TIME_TRACKING.updated, updated);
  addJson(properties, SP_TIME_TRACKING.data, entry.data);

  return properties;
};
