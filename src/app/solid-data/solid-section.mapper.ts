import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { Section } from '../features/section/section.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import {
  SOLID_PRODUCTIVITY_SECTIONS_CONTAINER,
  SOLID_PRODUCTIVITY_SECTION_TYPE,
  SP_SECTION,
} from './solid-productivity-vocab';
import {
  addArray,
  addLiteral,
  addOptionalLiteral,
  booleanProp,
  deleteAbsentValue,
  SolidRdfPropertyMap,
  stringArrayProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const sectionToSolidCreateInput = (
  section: Section,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_SECTIONS_CONTAINER,
    resourceName: section.id,
  },
  title: section.title,
  facets: {
    title: section.title,
    status: 'open',
  },
  properties: sectionToSolidProperties(section),
});

export const sectionToSolidChanges = (section: Section): ThingChanges => ({
  title: section.title,
  status: 'open',
  replaceProperties: buildSectionSolidProperties(section, {
    includeEmptyArrays: true,
  }),
  deleteProperties: sectionToSolidDeleteProperties(section),
});

export const sectionToSolidProperties = (section: Section): ThingRdfPropertyInput =>
  buildSectionSolidProperties(section, { includeEmptyArrays: false });

export const solidThingToSection = (thing: Thing): Section => ({
  id: stringProp(thing, SP_SECTION.id) ?? thing.uri,
  contextId: stringProp(thing, SP_SECTION.contextId) ?? '',
  contextType: workContextTypeProp(thing),
  title: thing.facets.title ?? stringProp(thing, SP_SECTION.title) ?? '',
  isExpanded: booleanProp(thing, SP_SECTION.isExpanded),
  taskIds: stringArrayProp(thing, SP_SECTION.taskId),
});

export const solidSectionQuery = {
  type: SOLID_PRODUCTIVITY_SECTION_TYPE,
} as const;

const buildSectionSolidProperties = (
  section: Section,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_SECTION.id, section.id);
  addLiteral(properties, SP_SECTION.contextId, section.contextId);
  addLiteral(properties, SP_SECTION.contextType, section.contextType);
  addLiteral(properties, SP_SECTION.title, section.title);
  addArray(properties, SP_SECTION.taskId, section.taskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addOptionalLiteral(properties, SP_SECTION.isExpanded, section.isExpanded);

  return properties;
};

const sectionToSolidDeleteProperties = (section: Section): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_SECTION.isExpanded, section.isExpanded);

  return properties;
};

const workContextTypeProp = (thing: Thing): WorkContextType => {
  const value = stringProp(thing, SP_SECTION.contextType);
  return value === WorkContextType.TAG ? WorkContextType.TAG : WorkContextType.PROJECT;
};
