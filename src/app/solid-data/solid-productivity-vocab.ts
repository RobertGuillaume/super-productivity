import type { RuntimeLayoutInput } from '@solid-intents/runtime';

export const SOLID_PRODUCTIVITY_NS = 'https://super-productivity.com/ns#';
export const SOLID_PRODUCTIVITY_TASK_TYPE = 'SuperProductivityTask';
export const SOLID_PRODUCTIVITY_PROJECT_TYPE = 'SuperProductivityProject';
export const SOLID_PRODUCTIVITY_TAG_TYPE = 'SuperProductivityTag';
export const SOLID_PRODUCTIVITY_NOTE_TYPE = 'SuperProductivityNote';
export const SOLID_PRODUCTIVITY_APP_STATE_TYPE = 'SuperProductivityAppState';
export const SOLID_PRODUCTIVITY_SECTION_TYPE = 'SuperProductivitySection';
export const SOLID_PRODUCTIVITY_TASKS_CONTAINER = 'super-productivity/tasks';
export const SOLID_PRODUCTIVITY_PROJECTS_CONTAINER = 'super-productivity/projects';
export const SOLID_PRODUCTIVITY_TAGS_CONTAINER = 'super-productivity/tags';
export const SOLID_PRODUCTIVITY_NOTES_CONTAINER = 'super-productivity/notes';
export const SOLID_PRODUCTIVITY_APP_CONTAINER = 'super-productivity/app';
export const SOLID_PRODUCTIVITY_SECTIONS_CONTAINER = 'super-productivity/sections';

export const RDF_JSON_DATATYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON';

export const SOLID_PRODUCTIVITY_LAYOUT = {
  namespace: SOLID_PRODUCTIVITY_NS,
  containers: {
    tasks: SOLID_PRODUCTIVITY_TASKS_CONTAINER,
    projects: SOLID_PRODUCTIVITY_PROJECTS_CONTAINER,
    tags: SOLID_PRODUCTIVITY_TAGS_CONTAINER,
    notes: SOLID_PRODUCTIVITY_NOTES_CONTAINER,
    app: SOLID_PRODUCTIVITY_APP_CONTAINER,
    sections: SOLID_PRODUCTIVITY_SECTIONS_CONTAINER,
  },
  types: {
    [SOLID_PRODUCTIVITY_TASK_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Task`,
      container: 'tasks',
      defaultStatus: 'open',
    },
    [SOLID_PRODUCTIVITY_PROJECT_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Project`,
      container: 'projects',
      defaultStatus: 'open',
    },
    [SOLID_PRODUCTIVITY_TAG_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Tag`,
      container: 'tags',
      defaultStatus: 'open',
    },
    [SOLID_PRODUCTIVITY_NOTE_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Note`,
      container: 'notes',
      defaultStatus: 'open',
    },
    [SOLID_PRODUCTIVITY_APP_STATE_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}AppState`,
      container: 'app',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_SECTION_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Section`,
      container: 'sections',
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

export const SP_PROJECT = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  isArchived: `${SOLID_PRODUCTIVITY_NS}isArchived`,
  isDone: `${SOLID_PRODUCTIVITY_NS}isDone`,
  doneOn: `${SOLID_PRODUCTIVITY_NS}doneOn`,
  isHiddenFromMenu: `${SOLID_PRODUCTIVITY_NS}isHiddenFromMenu`,
  isEnableBacklog: `${SOLID_PRODUCTIVITY_NS}isEnableBacklog`,
  taskId: `${SOLID_PRODUCTIVITY_NS}taskId`,
  backlogTaskId: `${SOLID_PRODUCTIVITY_NS}backlogTaskId`,
  noteId: `${SOLID_PRODUCTIVITY_NS}noteId`,
  theme: `${SOLID_PRODUCTIVITY_NS}theme`,
  advancedCfg: `${SOLID_PRODUCTIVITY_NS}advancedCfg`,
  issueIntegrationCfgs: `${SOLID_PRODUCTIVITY_NS}issueIntegrationCfgs`,
  icon: `${SOLID_PRODUCTIVITY_NS}icon`,
  created: `${SOLID_PRODUCTIVITY_NS}created`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
  folderId: `${SOLID_PRODUCTIVITY_NS}folderId`,
} as const;

export const SP_TAG = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  color: `${SOLID_PRODUCTIVITY_NS}color`,
  created: `${SOLID_PRODUCTIVITY_NS}created`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
  taskId: `${SOLID_PRODUCTIVITY_NS}taskId`,
  theme: `${SOLID_PRODUCTIVITY_NS}theme`,
  advancedCfg: `${SOLID_PRODUCTIVITY_NS}advancedCfg`,
  icon: `${SOLID_PRODUCTIVITY_NS}icon`,
} as const;

export const SP_NOTE = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  projectId: `${SOLID_PRODUCTIVITY_NS}projectId`,
  isPinnedToToday: `${SOLID_PRODUCTIVITY_NS}isPinnedToToday`,
  content: `${SOLID_PRODUCTIVITY_NS}content`,
  imgUrl: `${SOLID_PRODUCTIVITY_NS}imgUrl`,
  isLock: `${SOLID_PRODUCTIVITY_NS}isLock`,
  backgroundColor: `${SOLID_PRODUCTIVITY_NS}backgroundColor`,
  created: `${SOLID_PRODUCTIVITY_NS}created`,
  modified: `${SOLID_PRODUCTIVITY_NS}modified`,
} as const;

export const SP_APP_STATE = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  projectOrder: `${SOLID_PRODUCTIVITY_NS}projectOrder`,
  tagOrder: `${SOLID_PRODUCTIVITY_NS}tagOrder`,
  noteTodayOrder: `${SOLID_PRODUCTIVITY_NS}noteTodayOrder`,
  sectionOrder: `${SOLID_PRODUCTIVITY_NS}sectionOrder`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_SECTION = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  contextId: `${SOLID_PRODUCTIVITY_NS}contextId`,
  contextType: `${SOLID_PRODUCTIVITY_NS}contextType`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  isExpanded: `${SOLID_PRODUCTIVITY_NS}isExpanded`,
  taskId: `${SOLID_PRODUCTIVITY_NS}taskId`,
} as const;
