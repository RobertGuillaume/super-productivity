import type { RuntimeLayoutInput } from '@solid-intents/runtime';

export const SOLID_PRODUCTIVITY_NS = 'https://super-productivity.com/ns#';
export const SOLID_PRODUCTIVITY_TASK_TYPE = 'SuperProductivityTask';
export const SOLID_PRODUCTIVITY_TASKS_CONTAINER = 'super-productivity/tasks';

export const RDF_JSON_DATATYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON';

export const SOLID_PRODUCTIVITY_LAYOUT = {
  namespace: SOLID_PRODUCTIVITY_NS,
  containers: {
    tasks: SOLID_PRODUCTIVITY_TASKS_CONTAINER,
  },
  types: {
    [SOLID_PRODUCTIVITY_TASK_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Task`,
      container: 'tasks',
      defaultStatus: 'open',
    },
  },
} satisfies RuntimeLayoutInput;

export const SP_TASK = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  projectId: `${SOLID_PRODUCTIVITY_NS}projectId`,
  parentId: `${SOLID_PRODUCTIVITY_NS}parentId`,
  subTaskId: `${SOLID_PRODUCTIVITY_NS}subTaskId`,
  tagId: `${SOLID_PRODUCTIVITY_NS}tagId`,
  isDone: `${SOLID_PRODUCTIVITY_NS}isDone`,
  created: `${SOLID_PRODUCTIVITY_NS}created`,
  modified: `${SOLID_PRODUCTIVITY_NS}modified`,
  doneOn: `${SOLID_PRODUCTIVITY_NS}doneOn`,
  timeSpent: `${SOLID_PRODUCTIVITY_NS}timeSpent`,
  timeEstimate: `${SOLID_PRODUCTIVITY_NS}timeEstimate`,
  timeSpentOnDay: `${SOLID_PRODUCTIVITY_NS}timeSpentOnDay`,
  dueWithTime: `${SOLID_PRODUCTIVITY_NS}dueWithTime`,
  dueDay: `${SOLID_PRODUCTIVITY_NS}dueDay`,
  hasPlannedTime: `${SOLID_PRODUCTIVITY_NS}hasPlannedTime`,
  deadlineDay: `${SOLID_PRODUCTIVITY_NS}deadlineDay`,
  deadlineWithTime: `${SOLID_PRODUCTIVITY_NS}deadlineWithTime`,
  deadlineRemindAt: `${SOLID_PRODUCTIVITY_NS}deadlineRemindAt`,
  remindAt: `${SOLID_PRODUCTIVITY_NS}remindAt`,
  reminderId: `${SOLID_PRODUCTIVITY_NS}reminderId`,
  repeatCfgId: `${SOLID_PRODUCTIVITY_NS}repeatCfgId`,
  hideSubTasksMode: `${SOLID_PRODUCTIVITY_NS}hideSubTasksMode`,
  attachments: `${SOLID_PRODUCTIVITY_NS}attachments`,
  issueId: `${SOLID_PRODUCTIVITY_NS}issueId`,
  issueProviderId: `${SOLID_PRODUCTIVITY_NS}issueProviderId`,
  issueType: `${SOLID_PRODUCTIVITY_NS}issueType`,
  issueWasUpdated: `${SOLID_PRODUCTIVITY_NS}issueWasUpdated`,
  issueLastUpdated: `${SOLID_PRODUCTIVITY_NS}issueLastUpdated`,
  issueAttachmentNr: `${SOLID_PRODUCTIVITY_NS}issueAttachmentNr`,
  issueTimeTracked: `${SOLID_PRODUCTIVITY_NS}issueTimeTracked`,
  issuePoints: `${SOLID_PRODUCTIVITY_NS}issuePoints`,
  issueLastSyncedValues: `${SOLID_PRODUCTIVITY_NS}issueLastSyncedValues`,
} as const;
