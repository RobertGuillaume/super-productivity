import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
  TaskRepeatCfgCopy,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import {
  SOLID_PRODUCTIVITY_TASK_REPEAT_CFGS_CONTAINER,
  SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
  SP_TASK_REPEAT_CFG,
} from './solid-productivity-vocab';
import {
  addArray,
  addJson,
  addLiteral,
  addOptionalLiteral,
  booleanProp,
  deleteAbsentValue,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringArrayProp,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const taskRepeatCfgToSolidCreateInput = (
  taskRepeatCfg: TaskRepeatCfg,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_TASK_REPEAT_CFGS_CONTAINER,
    resourceName: taskRepeatCfg.id,
  },
  title: taskRepeatCfgTitle(taskRepeatCfg),
  facets: {
    title: taskRepeatCfgTitle(taskRepeatCfg),
    status: taskRepeatCfg.isPaused ? 'paused' : 'active',
  },
  properties: taskRepeatCfgToSolidProperties(taskRepeatCfg),
});

export const taskRepeatCfgToSolidChanges = (
  taskRepeatCfg: TaskRepeatCfg,
): ThingChanges => ({
  title: taskRepeatCfgTitle(taskRepeatCfg),
  status: taskRepeatCfg.isPaused ? 'paused' : 'active',
  replaceProperties: buildTaskRepeatCfgSolidProperties(taskRepeatCfg, {
    includeEmptyArrays: true,
  }),
  deleteProperties: taskRepeatCfgToSolidDeleteProperties(taskRepeatCfg),
});

export const taskRepeatCfgToSolidProperties = (
  taskRepeatCfg: TaskRepeatCfg,
): ThingRdfPropertyInput =>
  buildTaskRepeatCfgSolidProperties(taskRepeatCfg, { includeEmptyArrays: false });

export const solidThingToTaskRepeatCfg = (thing: Thing): TaskRepeatCfg => {
  const jsonTaskRepeatCfg = jsonProp<TaskRepeatCfg>(
    thing,
    SP_TASK_REPEAT_CFG.repeatCfgData,
  );
  const taskRepeatCfg =
    jsonTaskRepeatCfg !== undefined
      ? {
          ...DEFAULT_TASK_REPEAT_CFG,
          ...jsonTaskRepeatCfg,
        }
      : ({
          id: stringProp(thing, SP_TASK_REPEAT_CFG.id) ?? thing.uri,
          projectId: stringOrNullProp(thing, SP_TASK_REPEAT_CFG.projectId) ?? null,
          title: stringOrNullProp(thing, SP_TASK_REPEAT_CFG.title) ?? null,
          tagIds: stringArrayProp(thing, SP_TASK_REPEAT_CFG.tagId),
          isPaused:
            booleanProp(thing, SP_TASK_REPEAT_CFG.isPaused) ??
            thing.facets.status === 'paused',
          repeatCycle: stringProp(thing, SP_TASK_REPEAT_CFG.repeatCycle),
          quickSetting: stringProp(thing, SP_TASK_REPEAT_CFG.quickSetting),
          order: numberProp(thing, SP_TASK_REPEAT_CFG.order) ?? 0,
        } as TaskRepeatCfg);

  return {
    ...taskRepeatCfg,
    id: stringProp(thing, SP_TASK_REPEAT_CFG.id) ?? taskRepeatCfg.id,
    projectId:
      stringOrNullProp(thing, SP_TASK_REPEAT_CFG.projectId) ?? taskRepeatCfg.projectId,
    title: stringOrNullProp(thing, SP_TASK_REPEAT_CFG.title) ?? taskRepeatCfg.title,
    tagIds:
      stringArrayProp(thing, SP_TASK_REPEAT_CFG.tagId).length > 0
        ? stringArrayProp(thing, SP_TASK_REPEAT_CFG.tagId)
        : taskRepeatCfg.tagIds,
    isPaused: booleanProp(thing, SP_TASK_REPEAT_CFG.isPaused) ?? taskRepeatCfg.isPaused,
    repeatCycle:
      (stringProp(thing, SP_TASK_REPEAT_CFG.repeatCycle) as
        | TaskRepeatCfgCopy['repeatCycle']
        | undefined) ?? taskRepeatCfg.repeatCycle,
    quickSetting:
      (stringProp(thing, SP_TASK_REPEAT_CFG.quickSetting) as
        | TaskRepeatCfgCopy['quickSetting']
        | undefined) ?? taskRepeatCfg.quickSetting,
    order: numberProp(thing, SP_TASK_REPEAT_CFG.order) ?? taskRepeatCfg.order,
  };
};

export const solidTaskRepeatCfgQuery = {
  type: SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
} as const;

const buildTaskRepeatCfgSolidProperties = (
  taskRepeatCfg: TaskRepeatCfg,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_TASK_REPEAT_CFG.id, taskRepeatCfg.id);
  addLiteral(properties, SP_TASK_REPEAT_CFG.isPaused, taskRepeatCfg.isPaused);
  addLiteral(properties, SP_TASK_REPEAT_CFG.repeatCycle, taskRepeatCfg.repeatCycle);
  addLiteral(properties, SP_TASK_REPEAT_CFG.quickSetting, taskRepeatCfg.quickSetting);
  addLiteral(properties, SP_TASK_REPEAT_CFG.order, taskRepeatCfg.order);
  addArray(properties, SP_TASK_REPEAT_CFG.tagId, taskRepeatCfg.tagIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addJson(properties, SP_TASK_REPEAT_CFG.repeatCfgData, taskRepeatCfg);

  addOptionalLiteral(properties, SP_TASK_REPEAT_CFG.projectId, taskRepeatCfg.projectId);
  addOptionalLiteral(properties, SP_TASK_REPEAT_CFG.title, taskRepeatCfg.title);

  return properties;
};

const taskRepeatCfgToSolidDeleteProperties = (
  taskRepeatCfg: TaskRepeatCfg,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_TASK_REPEAT_CFG.projectId, taskRepeatCfg.projectId);
  deleteAbsentValue(properties, SP_TASK_REPEAT_CFG.title, taskRepeatCfg.title);

  return properties;
};

const taskRepeatCfgTitle = (taskRepeatCfg: TaskRepeatCfg): string =>
  taskRepeatCfg.title?.trim() || 'Repeat task';
