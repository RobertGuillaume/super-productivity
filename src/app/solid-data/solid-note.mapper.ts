import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { Note } from '../features/note/note.model';
import {
  SOLID_PRODUCTIVITY_NOTES_CONTAINER,
  SOLID_PRODUCTIVITY_NOTE_TYPE,
  SP_NOTE,
} from './solid-productivity-vocab';
import {
  addLiteral,
  addOptionalLiteral,
  booleanProp,
  deleteAbsentValue,
  numberProp,
  SolidRdfPropertyMap,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const noteToSolidCreateInput = (
  note: Note,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_NOTES_CONTAINER,
    resourceName: note.id,
  },
  title: noteTitle(note),
  facets: {
    title: noteTitle(note),
    status: note.isPinnedToToday ? 'pinned' : 'open',
  },
  properties: noteToSolidProperties(note),
});

export const noteToSolidChanges = (note: Note): ThingChanges => ({
  title: noteTitle(note),
  status: note.isPinnedToToday ? 'pinned' : 'open',
  replaceProperties: buildNoteSolidProperties(note),
  deleteProperties: noteToSolidDeleteProperties(note),
});

export const noteToSolidProperties = (note: Note): ThingRdfPropertyInput =>
  buildNoteSolidProperties(note);

export const solidThingToNote = (thing: Thing): Note => ({
  id: stringProp(thing, SP_NOTE.id) ?? thing.uri,
  projectId: stringOrNullProp(thing, SP_NOTE.projectId) ?? null,
  isPinnedToToday:
    booleanProp(thing, SP_NOTE.isPinnedToToday) ?? thing.facets.status === 'pinned',
  content: stringProp(thing, SP_NOTE.content) ?? '',
  imgUrl: stringProp(thing, SP_NOTE.imgUrl),
  isLock: booleanProp(thing, SP_NOTE.isLock),
  backgroundColor: stringProp(thing, SP_NOTE.backgroundColor),
  created: numberProp(thing, SP_NOTE.created) ?? Date.now(),
  modified: numberProp(thing, SP_NOTE.modified) ?? Date.now(),
});

export const solidNoteQuery = {
  type: SOLID_PRODUCTIVITY_NOTE_TYPE,
} as const;

const buildNoteSolidProperties = (note: Note): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_NOTE.id, note.id);
  addLiteral(properties, SP_NOTE.isPinnedToToday, note.isPinnedToToday);
  addLiteral(properties, SP_NOTE.content, note.content);
  addLiteral(properties, SP_NOTE.created, note.created);
  addLiteral(properties, SP_NOTE.modified, note.modified);

  addOptionalLiteral(properties, SP_NOTE.projectId, note.projectId);
  addOptionalLiteral(properties, SP_NOTE.imgUrl, note.imgUrl);
  addOptionalLiteral(properties, SP_NOTE.isLock, note.isLock);
  addOptionalLiteral(properties, SP_NOTE.backgroundColor, note.backgroundColor);

  return properties;
};

const noteToSolidDeleteProperties = (note: Note): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_NOTE.projectId, note.projectId);
  deleteAbsentValue(properties, SP_NOTE.imgUrl, note.imgUrl);
  deleteAbsentValue(properties, SP_NOTE.isLock, note.isLock);
  deleteAbsentValue(properties, SP_NOTE.backgroundColor, note.backgroundColor);

  return properties;
};

const noteTitle = (note: Note): string => {
  const firstLine = note.content.split('\n')[0]?.trim();
  return firstLine === undefined || firstLine.length === 0 ? 'Note' : firstLine;
};
