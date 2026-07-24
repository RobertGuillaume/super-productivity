import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project, ProjectCopy } from '../features/project/project.model';
import {
  SOLID_PRODUCTIVITY_PROJECTS_CONTAINER,
  SOLID_PRODUCTIVITY_PROJECT_TYPE,
  SP_PROJECT,
} from './solid-productivity-vocab';
import {
  addArray,
  addJson,
  addLiteral,
  addOptionalJson,
  addOptionalLiteral,
  booleanProp,
  deleteAbsentValue,
  jsonProp,
  numberOrNullProp,
  numberProp,
  SolidRdfPropertyMap,
  stringArrayProp,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const projectToSolidCreateInput = (
  project: Project,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_PROJECTS_CONTAINER,
    resourceName: project.id,
  },
  title: project.title,
  facets: {
    title: project.title,
    status: project.isArchived ? 'archived' : 'open',
  },
  properties: projectToSolidProperties(project),
});

export const projectToSolidChanges = (project: Project): ThingChanges => ({
  title: project.title,
  status: project.isArchived ? 'archived' : 'open',
  replaceProperties: buildProjectSolidProperties(project, {
    includeEmptyArrays: true,
  }),
  deleteProperties: projectToSolidDeleteProperties(project),
});

export const projectToSolidProperties = (project: Project): ThingRdfPropertyInput =>
  buildProjectSolidProperties(project, { includeEmptyArrays: false });

export const solidThingToProject = (thing: Thing): Project => {
  const project: ProjectCopy = {
    ...DEFAULT_PROJECT,
    id: stringProp(thing, SP_PROJECT.id) ?? thing.uri,
    title: thing.facets.title ?? stringProp(thing, SP_PROJECT.title) ?? '',
    isArchived:
      booleanProp(thing, SP_PROJECT.isArchived) ?? thing.facets.status === 'archived',
    isDone: booleanProp(thing, SP_PROJECT.isDone) ?? false,
    doneOn: numberOrNullProp(thing, SP_PROJECT.doneOn) ?? null,
    isHiddenFromMenu: booleanProp(thing, SP_PROJECT.isHiddenFromMenu) ?? false,
    isEnableBacklog: booleanProp(thing, SP_PROJECT.isEnableBacklog) ?? false,
    taskIds: stringArrayProp(thing, SP_PROJECT.taskId),
    backlogTaskIds: stringArrayProp(thing, SP_PROJECT.backlogTaskId),
    noteIds: stringArrayProp(thing, SP_PROJECT.noteId),
    theme:
      jsonProp<ProjectCopy['theme']>(thing, SP_PROJECT.theme) ?? DEFAULT_PROJECT.theme,
    advancedCfg:
      jsonProp<ProjectCopy['advancedCfg']>(thing, SP_PROJECT.advancedCfg) ??
      DEFAULT_PROJECT.advancedCfg,
    issueIntegrationCfgs: jsonProp<ProjectCopy['issueIntegrationCfgs']>(
      thing,
      SP_PROJECT.issueIntegrationCfgs,
    ),
    icon: stringOrNullProp(thing, SP_PROJECT.icon),
    created: numberProp(thing, SP_PROJECT.created),
    updated: numberProp(thing, SP_PROJECT.updated),
    folderId: stringOrNullProp(thing, SP_PROJECT.folderId),
  };

  return project;
};

export const solidProjectQuery = {
  type: SOLID_PRODUCTIVITY_PROJECT_TYPE,
} as const;

const buildProjectSolidProperties = (
  project: Project,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_PROJECT.id, project.id);
  addLiteral(properties, SP_PROJECT.title, project.title);
  addLiteral(properties, SP_PROJECT.isArchived, project.isArchived ?? false);
  addLiteral(properties, SP_PROJECT.isDone, project.isDone ?? false);
  addLiteral(properties, SP_PROJECT.isHiddenFromMenu, project.isHiddenFromMenu ?? false);
  addLiteral(properties, SP_PROJECT.isEnableBacklog, project.isEnableBacklog ?? false);
  addArray(properties, SP_PROJECT.taskId, project.taskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addArray(properties, SP_PROJECT.backlogTaskId, project.backlogTaskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addArray(properties, SP_PROJECT.noteId, project.noteIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addJson(properties, SP_PROJECT.theme, project.theme);
  addJson(properties, SP_PROJECT.advancedCfg, project.advancedCfg);

  addOptionalLiteral(properties, SP_PROJECT.doneOn, project.doneOn);
  addOptionalLiteral(properties, SP_PROJECT.icon, project.icon);
  addOptionalLiteral(properties, SP_PROJECT.created, project.created);
  addOptionalLiteral(properties, SP_PROJECT.updated, project.updated);
  addOptionalLiteral(properties, SP_PROJECT.folderId, project.folderId);
  addOptionalJson(
    properties,
    SP_PROJECT.issueIntegrationCfgs,
    project.issueIntegrationCfgs,
  );

  return properties;
};

const projectToSolidDeleteProperties = (project: Project): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_PROJECT.doneOn, project.doneOn);
  deleteAbsentValue(properties, SP_PROJECT.icon, project.icon);
  deleteAbsentValue(properties, SP_PROJECT.created, project.created);
  deleteAbsentValue(properties, SP_PROJECT.updated, project.updated);
  deleteAbsentValue(properties, SP_PROJECT.folderId, project.folderId);
  deleteAbsentValue(
    properties,
    SP_PROJECT.issueIntegrationCfgs,
    project.issueIntegrationCfgs,
  );

  return properties;
};
