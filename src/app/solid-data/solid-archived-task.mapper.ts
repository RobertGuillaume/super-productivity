import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { DEFAULT_TASK, Task, TaskCopy } from '../features/tasks/task.model';
import {
  SOLID_PRODUCTIVITY_ARCHIVED_TASKS_CONTAINER,
  SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
  SP_ARCHIVED_TASK,
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
  stringProp,
} from './solid-rdf.mapper-helpers';

export type SolidArchiveBucket = 'young' | 'old';

export interface SolidArchivedTask {
  task: Task;
  bucket: SolidArchiveBucket;
}

export const archivedTaskToSolidCreateInput = (
  archivedTask: SolidArchivedTask,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_ARCHIVED_TASKS_CONTAINER,
    resourceName: archivedTaskResourceName(archivedTask.task.id, archivedTask.bucket),
  },
  title: archivedTask.task.title,
  facets: {
    title: archivedTask.task.title,
    status: 'archived',
  },
  properties: archivedTaskToSolidProperties(archivedTask),
});

export const archivedTaskToSolidChanges = (
  archivedTask: SolidArchivedTask,
): ThingChanges => ({
  title: archivedTask.task.title,
  status: 'archived',
  replaceProperties: buildArchivedTaskSolidProperties(archivedTask, {
    includeEmptyArrays: true,
  }),
  deleteProperties: archivedTaskToSolidDeleteProperties(archivedTask),
});

export const archivedTaskToSolidProperties = (
  archivedTask: SolidArchivedTask,
): ThingRdfPropertyInput =>
  buildArchivedTaskSolidProperties(archivedTask, { includeEmptyArrays: false });

export const solidThingToArchivedTask = (thing: Thing): SolidArchivedTask => {
  const taskData = jsonProp<Task>(thing, SP_ARCHIVED_TASK.taskData);
  const task: TaskCopy = {
    ...DEFAULT_TASK,
    ...taskData,
    id: stringProp(thing, SP_ARCHIVED_TASK.id) ?? taskData?.id ?? thing.uri,
    title: thing.facets.title ?? taskData?.title ?? '',
    projectId: stringProp(thing, SP_ARCHIVED_TASK.projectId) ?? taskData?.projectId ?? '',
    parentId: stringProp(thing, SP_ARCHIVED_TASK.parentId) ?? taskData?.parentId,
    subTaskIds:
      stringArrayProp(thing, SP_ARCHIVED_TASK.subTaskId).length > 0
        ? stringArrayProp(thing, SP_ARCHIVED_TASK.subTaskId)
        : (taskData?.subTaskIds ?? []),
    tagIds:
      stringArrayProp(thing, SP_ARCHIVED_TASK.tagId).length > 0
        ? stringArrayProp(thing, SP_ARCHIVED_TASK.tagId)
        : (taskData?.tagIds ?? []),
    doneOn: numberProp(thing, SP_ARCHIVED_TASK.doneOn) ?? taskData?.doneOn,
  };

  return {
    task,
    bucket: stringProp(thing, SP_ARCHIVED_TASK.bucket) === 'old' ? 'old' : 'young',
  };
};

export const solidArchivedTaskQuery = {
  type: SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
} as const;

const buildArchivedTaskSolidProperties = (
  archivedTask: SolidArchivedTask,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const { task, bucket } = archivedTask;
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_ARCHIVED_TASK.id, task.id);
  addLiteral(properties, SP_ARCHIVED_TASK.bucket, bucket);
  addLiteral(properties, SP_ARCHIVED_TASK.projectId, task.projectId);
  addArray(properties, SP_ARCHIVED_TASK.subTaskId, task.subTaskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addArray(properties, SP_ARCHIVED_TASK.tagId, task.tagIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addJson(properties, SP_ARCHIVED_TASK.taskData, task);

  addOptionalLiteral(properties, SP_ARCHIVED_TASK.parentId, task.parentId);
  addOptionalLiteral(properties, SP_ARCHIVED_TASK.doneOn, task.doneOn);

  return properties;
};

const archivedTaskToSolidDeleteProperties = (
  archivedTask: SolidArchivedTask,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_ARCHIVED_TASK.parentId, archivedTask.task.parentId);
  deleteAbsentValue(properties, SP_ARCHIVED_TASK.doneOn, archivedTask.task.doneOn);

  return properties;
};

export const archivedTaskResourceName = (
  taskId: string,
  bucket: SolidArchiveBucket,
): string => `${bucket}-${taskId}`;
