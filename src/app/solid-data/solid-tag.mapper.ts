import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag, TagCopy } from '../features/tag/tag.model';
import {
  SOLID_PRODUCTIVITY_TAGS_CONTAINER,
  SOLID_PRODUCTIVITY_TAG_TYPE,
  SP_TAG,
} from './solid-productivity-vocab';
import {
  addArray,
  addJson,
  addLiteral,
  addOptionalLiteral,
  deleteAbsentValue,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringArrayProp,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const tagToSolidCreateInput = (
  tag: Tag,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_TAGS_CONTAINER,
    resourceName: tag.id,
  },
  title: tag.title,
  facets: {
    title: tag.title,
    status: 'open',
  },
  properties: tagToSolidProperties(tag),
});

export const tagToSolidChanges = (tag: Tag): ThingChanges => ({
  title: tag.title,
  status: 'open',
  replaceProperties: buildTagSolidProperties(tag, { includeEmptyArrays: true }),
  deleteProperties: tagToSolidDeleteProperties(tag),
});

export const tagToSolidProperties = (tag: Tag): ThingRdfPropertyInput =>
  buildTagSolidProperties(tag, { includeEmptyArrays: false });

export const solidThingToTag = (thing: Thing): Tag => {
  const tag: TagCopy = {
    ...DEFAULT_TAG,
    id: stringProp(thing, SP_TAG.id) ?? thing.uri,
    title: thing.facets.title ?? stringProp(thing, SP_TAG.title) ?? '',
    color: stringOrNullProp(thing, SP_TAG.color) ?? null,
    created: numberProp(thing, SP_TAG.created) ?? Date.now(),
    updated: numberProp(thing, SP_TAG.updated),
    taskIds: stringArrayProp(thing, SP_TAG.taskId),
    theme: jsonProp<TagCopy['theme']>(thing, SP_TAG.theme) ?? DEFAULT_TAG.theme,
    advancedCfg:
      jsonProp<TagCopy['advancedCfg']>(thing, SP_TAG.advancedCfg) ??
      DEFAULT_TAG.advancedCfg,
    icon: stringOrNullProp(thing, SP_TAG.icon),
  };

  return tag;
};

export const solidTagQuery = {
  type: SOLID_PRODUCTIVITY_TAG_TYPE,
} as const;

const buildTagSolidProperties = (
  tag: Tag,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_TAG.id, tag.id);
  addLiteral(properties, SP_TAG.title, tag.title);
  addLiteral(properties, SP_TAG.created, tag.created);
  addArray(properties, SP_TAG.taskId, tag.taskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addJson(properties, SP_TAG.theme, tag.theme);
  addJson(properties, SP_TAG.advancedCfg, tag.advancedCfg);

  addOptionalLiteral(properties, SP_TAG.color, tag.color);
  addOptionalLiteral(properties, SP_TAG.updated, tag.updated);
  addOptionalLiteral(properties, SP_TAG.icon, tag.icon);

  return properties;
};

const tagToSolidDeleteProperties = (tag: Tag): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_TAG.color, tag.color);
  deleteAbsentValue(properties, SP_TAG.updated, tag.updated);
  deleteAbsentValue(properties, SP_TAG.icon, tag.icon);

  return properties;
};
