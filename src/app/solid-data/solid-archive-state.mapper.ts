import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import {
  SOLID_PRODUCTIVITY_ARCHIVE_STATE_CONTAINER,
  SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
  SP_ARCHIVE_STATE,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export type SolidArchiveStateBucket = 'young' | 'old';

export interface SolidArchiveState {
  id: string;
  bucket: SolidArchiveStateBucket;
  timeTracking: TimeTrackingState;
  lastTimeTrackingFlush: number;
  updated: number;
}

export const archiveStateResourceName = (bucket: SolidArchiveStateBucket): string =>
  `archive-${bucket}`;

export const archiveStateToSolidCreateInput = (
  archiveState: SolidArchiveState,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_ARCHIVE_STATE_CONTAINER,
    resourceName: archiveStateResourceName(archiveState.bucket),
  },
  title: `Archive ${archiveState.bucket}`,
  facets: {
    title: `Archive ${archiveState.bucket}`,
    status: 'active',
  },
  properties: archiveStateToSolidProperties(archiveState, updated),
});

export const archiveStateToSolidChanges = (
  archiveState: SolidArchiveState,
  updated = Date.now(),
): ThingChanges => ({
  title: `Archive ${archiveState.bucket}`,
  status: 'active',
  replaceProperties: buildArchiveStateSolidProperties(archiveState, updated),
});

export const archiveStateToSolidProperties = (
  archiveState: SolidArchiveState,
  updated = Date.now(),
): ThingRdfPropertyInput => buildArchiveStateSolidProperties(archiveState, updated);

export const solidThingToArchiveState = (thing: Thing): SolidArchiveState | null => {
  const bucket = stringProp(
    thing,
    SP_ARCHIVE_STATE.bucket,
  ) as SolidArchiveStateBucket | null;
  const timeTracking = jsonProp<TimeTrackingState>(thing, SP_ARCHIVE_STATE.timeTracking);

  if (!bucket || !timeTracking) {
    return null;
  }

  return {
    id: stringProp(thing, SP_ARCHIVE_STATE.id) ?? archiveStateResourceName(bucket),
    bucket,
    timeTracking,
    lastTimeTrackingFlush: numberProp(thing, SP_ARCHIVE_STATE.lastTimeTrackingFlush) ?? 0,
    updated: numberProp(thing, SP_ARCHIVE_STATE.updated) ?? 0,
  };
};

export const solidArchiveStateQuery = {
  type: SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
} as const;

export const createDefaultSolidArchiveState = (
  bucket: SolidArchiveStateBucket,
): SolidArchiveState => ({
  id: archiveStateResourceName(bucket),
  bucket,
  timeTracking: {
    project: {},
    tag: {},
  },
  lastTimeTrackingFlush: 0,
  updated: 0,
});

const buildArchiveStateSolidProperties = (
  archiveState: SolidArchiveState,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_ARCHIVE_STATE.id, archiveState.id);
  addLiteral(properties, SP_ARCHIVE_STATE.bucket, archiveState.bucket);
  addLiteral(
    properties,
    SP_ARCHIVE_STATE.lastTimeTrackingFlush,
    archiveState.lastTimeTrackingFlush,
  );
  addLiteral(properties, SP_ARCHIVE_STATE.updated, updated);
  addJson(properties, SP_ARCHIVE_STATE.timeTracking, archiveState.timeTracking);

  return properties;
};
