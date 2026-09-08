import { views } from '@solid-intents/runtime';
import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { INBOX_PROJECT } from '../features/project/project.const';
import {
  DEFAULT_TASK,
  HideSubTasksMode,
  Task,
  TaskCopy,
} from '../features/tasks/task.model';
import {
  ICAL_TASK,
  SCHEMA_THING,
  SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE,
  SOLID_PRODUCTIVITY_TASKS_CONTAINER,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SP_TASK,
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

export const taskToSolidCreateInput = (
  task: Task,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_TASKS_CONTAINER,
    resourceName: task.id,
  },
  title: task.title,
  facets: {
    title: task.title,
    status: task.isDone ? 'done' : 'open',
  },
  properties: taskToSolidProperties(task),
});

export const taskToSolidChanges = (task: Task): ThingChanges => ({
  replaceProperties: taskToSolidReplacementProperties(task),
  deleteProperties: taskToSolidDeleteProperties(task),
});

export const taskToSolidProperties = (task: Task): ThingRdfPropertyInput =>
  buildTaskSolidProperties(task, { includeEmptyArrays: false });

const taskToSolidReplacementProperties = (task: Task): ThingRdfPropertyInput => {
  const properties = buildTaskSolidProperties(task, { includeEmptyArrays: true });
  addLiteral(properties, SCHEMA_THING.title, task.title);
  addLiteral(properties, SCHEMA_THING.status, task.isDone ? 'done' : 'open');
  return properties;
};

const buildTaskSolidProperties = (
  task: Task,
  options: { includeEmptyArrays: boolean },
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, ICAL_TASK.summary, task.title);
  addLiteral(properties, ICAL_TASK.status, task.isDone ? 'COMPLETED' : 'NEEDS-ACTION');
  addOptionalLiteral(
    properties,
    ICAL_TASK.due,
    task.dueWithTime === null || task.dueWithTime === undefined
      ? undefined
      : new Date(task.dueWithTime),
  );
  addLiteral(properties, SP_TASK.id, task.id);
  addLiteral(properties, SP_TASK.projectId, task.projectId);
  addLiteral(properties, SP_TASK.isDone, task.isDone);
  addLiteral(properties, SP_TASK.created, task.created);
  addLiteral(properties, SP_TASK.timeSpent, task.timeSpent);
  addLiteral(properties, SP_TASK.timeEstimate, task.timeEstimate);
  addArray(properties, SP_TASK.subTaskId, task.subTaskIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addArray(properties, SP_TASK.tagId, task.tagIds, {
    includeEmpty: options.includeEmptyArrays,
  });
  addJson(properties, SP_TASK.attachments, task.attachments);
  addJson(properties, SP_TASK.timeSpentOnDay, task.timeSpentOnDay);

  addOptionalLiteral(properties, SP_TASK.modified, task.modified);
  addOptionalLiteral(properties, SP_TASK.doneOn, task.doneOn);
  addOptionalLiteral(properties, SP_TASK.parentId, task.parentId);
  addOptionalLiteral(properties, SP_TASK.dueWithTime, task.dueWithTime);
  addOptionalLiteral(properties, SP_TASK.dueDay, task.dueDay);
  addOptionalLiteral(properties, SP_TASK.hasPlannedTime, task.hasPlannedTime);
  addOptionalLiteral(properties, SP_TASK.deadlineDay, task.deadlineDay);
  addOptionalLiteral(properties, SP_TASK.deadlineWithTime, task.deadlineWithTime);
  addOptionalLiteral(properties, SP_TASK.deadlineRemindAt, task.deadlineRemindAt);
  addOptionalLiteral(properties, SP_TASK.remindAt, task.remindAt);
  addOptionalLiteral(properties, SP_TASK.reminderId, task.reminderId);
  addOptionalLiteral(properties, SP_TASK.repeatCfgId, task.repeatCfgId);
  addOptionalLiteral(properties, SP_TASK.hideSubTasksMode, task._hideSubTasksMode);
  addOptionalLiteral(properties, SP_TASK.issueId, task.issueId);
  addOptionalLiteral(properties, SP_TASK.issueProviderId, task.issueProviderId);
  addOptionalLiteral(properties, SP_TASK.issueType, task.issueType);
  addOptionalLiteral(properties, SP_TASK.issueWasUpdated, task.issueWasUpdated);
  addOptionalLiteral(properties, SP_TASK.issueLastUpdated, task.issueLastUpdated);
  addOptionalLiteral(properties, SP_TASK.issueAttachmentNr, task.issueAttachmentNr);
  addOptionalLiteral(properties, SP_TASK.issuePoints, task.issuePoints);
  addOptionalJson(properties, SP_TASK.issueTimeTracked, task.issueTimeTracked);
  addOptionalJson(properties, SP_TASK.issueLastSyncedValues, task.issueLastSyncedValues);

  return properties;
};

const taskToSolidDeleteProperties = (task: Task): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, ICAL_TASK.due, task.dueWithTime);
  deleteAbsentValue(properties, SP_TASK.modified, task.modified);
  deleteAbsentValue(properties, SP_TASK.doneOn, task.doneOn);
  deleteAbsentValue(properties, SP_TASK.parentId, task.parentId);
  deleteAbsentValue(properties, SP_TASK.dueWithTime, task.dueWithTime);
  deleteAbsentValue(properties, SP_TASK.dueDay, task.dueDay);
  deleteAbsentValue(properties, SP_TASK.hasPlannedTime, task.hasPlannedTime);
  deleteAbsentValue(properties, SP_TASK.deadlineDay, task.deadlineDay);
  deleteAbsentValue(properties, SP_TASK.deadlineWithTime, task.deadlineWithTime);
  deleteAbsentValue(properties, SP_TASK.deadlineRemindAt, task.deadlineRemindAt);
  deleteAbsentValue(properties, SP_TASK.remindAt, task.remindAt);
  deleteAbsentValue(properties, SP_TASK.reminderId, task.reminderId);
  deleteAbsentValue(properties, SP_TASK.repeatCfgId, task.repeatCfgId);
  deleteAbsentValue(properties, SP_TASK.hideSubTasksMode, task._hideSubTasksMode);
  deleteAbsentValue(properties, SP_TASK.issueId, task.issueId);
  deleteAbsentValue(properties, SP_TASK.issueProviderId, task.issueProviderId);
  deleteAbsentValue(properties, SP_TASK.issueType, task.issueType);
  deleteAbsentValue(properties, SP_TASK.issueWasUpdated, task.issueWasUpdated);
  deleteAbsentValue(properties, SP_TASK.issueLastUpdated, task.issueLastUpdated);
  deleteAbsentValue(properties, SP_TASK.issueAttachmentNr, task.issueAttachmentNr);
  deleteAbsentValue(properties, SP_TASK.issueTimeTracked, task.issueTimeTracked);
  deleteAbsentValue(properties, SP_TASK.issuePoints, task.issuePoints);
  deleteAbsentValue(
    properties,
    SP_TASK.issueLastSyncedValues,
    task.issueLastSyncedValues,
  );

  return properties;
};

export const solidThingToTask = (thing: Thing): Task => {
  const nativeDue = thing.as(views.Task).dueDate?.getTime();
  const dueWithTime = numberOrNullProp(thing, SP_TASK.dueWithTime);
  const dueDay = stringOrNullProp(thing, SP_TASK.dueDay);
  const nativeStatus = stringProp(thing, ICAL_TASK.status)?.toLowerCase();
  const nativeTitle = stringProp(thing, ICAL_TASK.summary);
  const facetStatus = thing.facets.status?.toLowerCase();
  const task: TaskCopy = {
    ...DEFAULT_TASK,
    id: stringProp(thing, SP_TASK.id) ?? thing.uri,
    title: nonEmptyString(thing.facets.title) ?? nativeTitle ?? '',
    projectId: stringProp(thing, SP_TASK.projectId) ?? INBOX_PROJECT.id,
    isDone:
      booleanProp(thing, SP_TASK.isDone) ??
      (facetStatus === 'done' ||
        facetStatus === 'completed' ||
        nativeStatus === 'completed'),
    created: numberProp(thing, SP_TASK.created) ?? thing.facets.createdAt?.getTime() ?? 0,
    modified: numberProp(thing, SP_TASK.modified),
    doneOn: numberProp(thing, SP_TASK.doneOn),
    parentId: stringProp(thing, SP_TASK.parentId),
    subTaskIds: stringArrayProp(thing, SP_TASK.subTaskId),
    tagIds: stringArrayProp(thing, SP_TASK.tagId),
    timeSpent: numberProp(thing, SP_TASK.timeSpent) ?? 0,
    timeEstimate: numberProp(thing, SP_TASK.timeEstimate) ?? 0,
    timeSpentOnDay:
      jsonProp<TaskCopy['timeSpentOnDay']>(thing, SP_TASK.timeSpentOnDay) ?? {},
    dueWithTime: dueWithTime !== undefined ? dueWithTime : dueDay ? undefined : nativeDue,
    dueDay,
    hasPlannedTime: booleanProp(thing, SP_TASK.hasPlannedTime),
    deadlineDay: stringOrNullProp(thing, SP_TASK.deadlineDay),
    deadlineWithTime: numberOrNullProp(thing, SP_TASK.deadlineWithTime),
    deadlineRemindAt: numberOrNullProp(thing, SP_TASK.deadlineRemindAt),
    attachments: jsonProp<TaskCopy['attachments']>(thing, SP_TASK.attachments) ?? [],
    reminderId: stringOrNullProp(thing, SP_TASK.reminderId),
    remindAt: numberProp(thing, SP_TASK.remindAt),
    repeatCfgId: stringProp(thing, SP_TASK.repeatCfgId),
    _hideSubTasksMode: hideSubTasksModeProp(thing, SP_TASK.hideSubTasksMode),
    issueId: stringProp(thing, SP_TASK.issueId),
    issueProviderId: stringProp(thing, SP_TASK.issueProviderId),
    issueType: stringProp(thing, SP_TASK.issueType) as TaskCopy['issueType'],
    issueWasUpdated: booleanProp(thing, SP_TASK.issueWasUpdated),
    issueLastUpdated: numberOrNullProp(thing, SP_TASK.issueLastUpdated),
    issueAttachmentNr: numberProp(thing, SP_TASK.issueAttachmentNr),
    issueTimeTracked: jsonProp<TaskCopy['issueTimeTracked']>(
      thing,
      SP_TASK.issueTimeTracked,
    ),
    issuePoints: numberProp(thing, SP_TASK.issuePoints),
    issueLastSyncedValues: jsonProp<TaskCopy['issueLastSyncedValues']>(
      thing,
      SP_TASK.issueLastSyncedValues,
    ),
  };

  return task;
};

export const solidTaskQuery = {
  type: [SOLID_PRODUCTIVITY_TASK_TYPE, SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE],
} as const;

const nonEmptyString = (value: string | undefined): string | undefined =>
  value?.trim() === '' ? undefined : value;

const hideSubTasksModeProp = (
  thing: Thing,
  predicate: string,
): HideSubTasksMode | undefined => {
  const value = numberProp(thing, predicate);
  return value === HideSubTasksMode.HideAll || value === HideSubTasksMode.HideDone
    ? value
    : undefined;
};
