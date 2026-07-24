import type {
  CreateThingInput,
  RdfLiteralValue,
  RdfValue,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingRdfPropertyValue,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  DEFAULT_TASK,
  HideSubTasksMode,
  Task,
  TaskCopy,
} from '../features/tasks/task.model';
import {
  RDF_JSON_DATATYPE,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SP_TASK,
} from './solid-productivity-vocab';

export const taskToSolidCreateInput = (
  task: Task,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  title: task.title,
  facets: {
    title: task.title,
    status: task.isDone ? 'done' : 'open',
  },
  properties: taskToSolidProperties(task),
});

export const taskToSolidChanges = (task: Task): ThingChanges => ({
  title: task.title,
  status: task.isDone ? 'done' : 'open',
  properties: taskToSolidProperties(task),
});

export const taskToSolidProperties = (task: Task): ThingRdfPropertyInput => {
  const properties: Record<string, readonly ThingRdfPropertyValue[]> = {};

  addLiteral(properties, SP_TASK.id, task.id);
  addLiteral(properties, SP_TASK.projectId, task.projectId);
  addLiteral(properties, SP_TASK.isDone, task.isDone);
  addLiteral(properties, SP_TASK.created, task.created);
  addLiteral(properties, SP_TASK.timeSpent, task.timeSpent);
  addLiteral(properties, SP_TASK.timeEstimate, task.timeEstimate);
  addArray(properties, SP_TASK.subTaskId, task.subTaskIds);
  addArray(properties, SP_TASK.tagId, task.tagIds);
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

export const solidThingToTask = (thing: Thing): Task => {
  const task: TaskCopy = {
    ...DEFAULT_TASK,
    id: stringProp(thing, SP_TASK.id) ?? thing.uri,
    title: thing.facets.title ?? '',
    projectId: stringProp(thing, SP_TASK.projectId) ?? '',
    isDone: booleanProp(thing, SP_TASK.isDone) ?? thing.facets.status === 'done',
    created: numberProp(thing, SP_TASK.created) ?? Date.now(),
    modified: numberProp(thing, SP_TASK.modified),
    doneOn: numberProp(thing, SP_TASK.doneOn),
    parentId: stringProp(thing, SP_TASK.parentId),
    subTaskIds: stringArrayProp(thing, SP_TASK.subTaskId),
    tagIds: stringArrayProp(thing, SP_TASK.tagId),
    timeSpent: numberProp(thing, SP_TASK.timeSpent) ?? 0,
    timeEstimate: numberProp(thing, SP_TASK.timeEstimate) ?? 0,
    timeSpentOnDay:
      jsonProp<TaskCopy['timeSpentOnDay']>(thing, SP_TASK.timeSpentOnDay) ?? {},
    dueWithTime: numberOrNullProp(thing, SP_TASK.dueWithTime),
    dueDay: stringOrNullProp(thing, SP_TASK.dueDay),
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
  type: SOLID_PRODUCTIVITY_TASK_TYPE,
} as const;

const addLiteral = (
  properties: Record<string, readonly ThingRdfPropertyValue[]>,
  predicate: string,
  value: ThingRdfPropertyValue,
): void => {
  properties[predicate] = [value];
};

const addOptionalLiteral = (
  properties: Record<string, readonly ThingRdfPropertyValue[]>,
  predicate: string,
  value: ThingRdfPropertyValue | null | undefined,
): void => {
  if (value !== null && value !== undefined) {
    addLiteral(properties, predicate, value);
  }
};

const addArray = (
  properties: Record<string, readonly ThingRdfPropertyValue[]>,
  predicate: string,
  values: readonly string[],
): void => {
  if (values.length > 0) {
    properties[predicate] = values;
  }
};

const addJson = (
  properties: Record<string, readonly ThingRdfPropertyValue[]>,
  predicate: string,
  value: unknown,
): void => {
  addLiteral(properties, predicate, {
    kind: 'literal',
    value: JSON.stringify(value),
    datatype: RDF_JSON_DATATYPE,
  });
};

const addOptionalJson = (
  properties: Record<string, readonly ThingRdfPropertyValue[]>,
  predicate: string,
  value: unknown,
): void => {
  if (value !== null && value !== undefined) {
    addJson(properties, predicate, value);
  }
};

const literalProps = (thing: Thing, predicate: string): RdfLiteralValue[] =>
  thing.property(predicate).filter(isLiteralValue);

const stringProp = (thing: Thing, predicate: string): string | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  return typeof value === 'string' ? value : undefined;
};

const stringOrNullProp = (thing: Thing, predicate: string): string | null | undefined => {
  const value = stringProp(thing, predicate);
  return value === undefined ? undefined : value;
};

const stringArrayProp = (thing: Thing, predicate: string): string[] =>
  literalProps(thing, predicate)
    .map((value) => value.value)
    .filter((value): value is string => typeof value === 'string');

const numberProp = (thing: Thing, predicate: string): number | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const numberOrNullProp = (thing: Thing, predicate: string): number | null | undefined => {
  const value = numberProp(thing, predicate);
  return value === undefined ? undefined : value;
};

const booleanProp = (thing: Thing, predicate: string): boolean | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const jsonProp = <T>(thing: Thing, predicate: string): T | undefined => {
  const raw = stringProp(thing, predicate);
  if (raw === undefined) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const hideSubTasksModeProp = (
  thing: Thing,
  predicate: string,
): HideSubTasksMode | undefined => {
  const value = numberProp(thing, predicate);
  return value === HideSubTasksMode.HideAll || value === HideSubTasksMode.HideDone
    ? value
    : undefined;
};

const isLiteralValue = (value: RdfValue): value is RdfLiteralValue =>
  value.kind === 'literal';
