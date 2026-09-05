import type { RuntimeLayoutInput } from '@solid-intents/runtime';

export const SOLID_PRODUCTIVITY_NS = 'https://super-productivity.com/ns#';
export const SOLID_PRODUCTIVITY_TASK_TYPE = 'Task';
export const SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE = 'SuperProductivityTask';
export const SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS = `${SOLID_PRODUCTIVITY_NS}Task`;
export const ICAL_VTODO_CLASS = 'http://www.w3.org/2002/12/cal/ical#Vtodo';
export const ICAL_TASK = {
  summary: 'http://www.w3.org/2002/12/cal/ical#summary',
  due: 'http://www.w3.org/2002/12/cal/ical#due',
  status: 'http://www.w3.org/2002/12/cal/ical#status',
} as const;
export const SOLID_PRODUCTIVITY_PROJECT_TYPE = 'SuperProductivityProject';
export const SOLID_PRODUCTIVITY_TAG_TYPE = 'SuperProductivityTag';
export const SOLID_PRODUCTIVITY_NOTE_TYPE = 'SuperProductivityNote';
export const SOLID_PRODUCTIVITY_APP_STATE_TYPE = 'SuperProductivityAppState';
export const SOLID_PRODUCTIVITY_SECTION_TYPE = 'SuperProductivitySection';
export const SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE = 'SuperProductivityIssueProvider';
export const SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE = 'SuperProductivityTaskRepeatCfg';
export const SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE = 'SuperProductivityArchivedTask';
export const SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE = 'SuperProductivityArchiveState';
export const SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE = 'SuperProductivityPlannerDay';
export const SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE = 'SuperProductivityPlannerState';
export const SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE = 'SuperProductivitySimpleCounter';
export const SOLID_PRODUCTIVITY_METRIC_TYPE = 'SuperProductivityMetric';
export const SOLID_PRODUCTIVITY_BOARD_TYPE = 'SuperProductivityBoard';
export const SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE = 'SuperProductivityGlobalConfig';
export const SOLID_PRODUCTIVITY_MENU_TREE_TYPE = 'SuperProductivityMenuTree';
export const SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE = 'SuperProductivityTimeTracking';
export const SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE = 'SuperProductivityPluginUserData';
export const SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE = 'SuperProductivityPluginMetadata';
export const SOLID_PRODUCTIVITY_TASKS_CONTAINER = 'super-productivity/tasks';
export const SOLID_PRODUCTIVITY_PROJECTS_CONTAINER = 'super-productivity/projects';
export const SOLID_PRODUCTIVITY_TAGS_CONTAINER = 'super-productivity/tags';
export const SOLID_PRODUCTIVITY_NOTES_CONTAINER = 'super-productivity/notes';
export const SOLID_PRODUCTIVITY_APP_CONTAINER = 'super-productivity/app';
export const SOLID_PRODUCTIVITY_SECTIONS_CONTAINER = 'super-productivity/sections';
export const SOLID_PRODUCTIVITY_ISSUE_PROVIDERS_CONTAINER =
  'super-productivity/issue-providers';
export const SOLID_PRODUCTIVITY_TASK_REPEAT_CFGS_CONTAINER =
  'super-productivity/repeat-configs';
export const SOLID_PRODUCTIVITY_ARCHIVED_TASKS_CONTAINER =
  'super-productivity/archive/tasks';
export const SOLID_PRODUCTIVITY_ARCHIVE_STATE_CONTAINER =
  'super-productivity/archive/state';
export const SOLID_PRODUCTIVITY_PLANNER_CONTAINER = 'super-productivity/planner';
export const SOLID_PRODUCTIVITY_SIMPLE_COUNTERS_CONTAINER =
  'super-productivity/simple-counters';
export const SOLID_PRODUCTIVITY_METRICS_CONTAINER = 'super-productivity/metrics';
export const SOLID_PRODUCTIVITY_BOARDS_CONTAINER = 'super-productivity/boards';
export const SOLID_PRODUCTIVITY_CONFIG_CONTAINER = 'super-productivity/config';
export const SOLID_PRODUCTIVITY_MENU_TREE_CONTAINER = 'super-productivity/menu-tree';
export const SOLID_PRODUCTIVITY_TIME_TRACKING_CONTAINER =
  'super-productivity/time-tracking';
export const SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_CONTAINER =
  'super-productivity/plugins/user-data';
export const SOLID_PRODUCTIVITY_PLUGIN_METADATA_CONTAINER =
  'super-productivity/plugins/metadata';

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
    issueProviders: SOLID_PRODUCTIVITY_ISSUE_PROVIDERS_CONTAINER,
    taskRepeatCfgs: SOLID_PRODUCTIVITY_TASK_REPEAT_CFGS_CONTAINER,
    archivedTasks: SOLID_PRODUCTIVITY_ARCHIVED_TASKS_CONTAINER,
    archiveState: SOLID_PRODUCTIVITY_ARCHIVE_STATE_CONTAINER,
    planner: SOLID_PRODUCTIVITY_PLANNER_CONTAINER,
    simpleCounters: SOLID_PRODUCTIVITY_SIMPLE_COUNTERS_CONTAINER,
    metrics: SOLID_PRODUCTIVITY_METRICS_CONTAINER,
    boards: SOLID_PRODUCTIVITY_BOARDS_CONTAINER,
    config: SOLID_PRODUCTIVITY_CONFIG_CONTAINER,
    menuTree: SOLID_PRODUCTIVITY_MENU_TREE_CONTAINER,
    timeTracking: SOLID_PRODUCTIVITY_TIME_TRACKING_CONTAINER,
    pluginUserData: SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_CONTAINER,
    pluginMetadata: SOLID_PRODUCTIVITY_PLUGIN_METADATA_CONTAINER,
  },
  types: {
    [SOLID_PRODUCTIVITY_TASK_TYPE]: {
      classUri: ICAL_VTODO_CLASS,
      classUris: [SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS],
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
    [SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}IssueProvider`,
      container: 'issueProviders',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}TaskRepeatCfg`,
      container: 'taskRepeatCfgs',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}ArchivedTask`,
      container: 'archivedTasks',
      defaultStatus: 'archived',
    },
    [SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}ArchiveState`,
      container: 'archiveState',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}PlannerDay`,
      container: 'planner',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}PlannerState`,
      container: 'planner',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}SimpleCounter`,
      container: 'simpleCounters',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_METRIC_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Metric`,
      container: 'metrics',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_BOARD_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}Board`,
      container: 'boards',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}GlobalConfig`,
      container: 'config',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_MENU_TREE_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}MenuTree`,
      container: 'menuTree',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}TimeTracking`,
      container: 'timeTracking',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}PluginUserData`,
      container: 'pluginUserData',
      defaultStatus: 'active',
    },
    [SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE]: {
      classUri: `${SOLID_PRODUCTIVITY_NS}PluginMetadata`,
      container: 'pluginMetadata',
      defaultStatus: 'active',
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

export const SP_ISSUE_PROVIDER = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  issueProviderKey: `${SOLID_PRODUCTIVITY_NS}issueProviderKey`,
  isEnabled: `${SOLID_PRODUCTIVITY_NS}isEnabled`,
  order: `${SOLID_PRODUCTIVITY_NS}order`,
  defaultProjectId: `${SOLID_PRODUCTIVITY_NS}defaultProjectId`,
  pinnedSearch: `${SOLID_PRODUCTIVITY_NS}pinnedSearch`,
  providerData: `${SOLID_PRODUCTIVITY_NS}providerData`,
} as const;

export const SP_TASK_REPEAT_CFG = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  projectId: `${SOLID_PRODUCTIVITY_NS}projectId`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  tagId: `${SOLID_PRODUCTIVITY_NS}tagId`,
  isPaused: `${SOLID_PRODUCTIVITY_NS}isPaused`,
  repeatCycle: `${SOLID_PRODUCTIVITY_NS}repeatCycle`,
  quickSetting: `${SOLID_PRODUCTIVITY_NS}quickSetting`,
  order: `${SOLID_PRODUCTIVITY_NS}order`,
  repeatCfgData: `${SOLID_PRODUCTIVITY_NS}repeatCfgData`,
} as const;

export const SP_ARCHIVED_TASK = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  bucket: `${SOLID_PRODUCTIVITY_NS}archiveBucket`,
  projectId: `${SOLID_PRODUCTIVITY_NS}projectId`,
  parentId: `${SOLID_PRODUCTIVITY_NS}parentId`,
  subTaskId: `${SOLID_PRODUCTIVITY_NS}subTaskId`,
  tagId: `${SOLID_PRODUCTIVITY_NS}tagId`,
  doneOn: `${SOLID_PRODUCTIVITY_NS}doneOn`,
  taskData: `${SOLID_PRODUCTIVITY_NS}taskData`,
} as const;

export const SP_ARCHIVE_STATE = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  bucket: `${SOLID_PRODUCTIVITY_NS}archiveBucket`,
  lastTimeTrackingFlush: `${SOLID_PRODUCTIVITY_NS}lastTimeTrackingFlush`,
  timeTracking: `${SOLID_PRODUCTIVITY_NS}timeTracking`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_PLANNER_DAY = {
  day: `${SOLID_PRODUCTIVITY_NS}day`,
  taskId: `${SOLID_PRODUCTIVITY_NS}taskId`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_PLANNER_STATE = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  addPlannedTasksDialogLastShown: `${SOLID_PRODUCTIVITY_NS}addPlannedTasksDialogLastShown`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_SIMPLE_COUNTER = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  isEnabled: `${SOLID_PRODUCTIVITY_NS}isEnabled`,
  isHideButton: `${SOLID_PRODUCTIVITY_NS}isHideButton`,
  icon: `${SOLID_PRODUCTIVITY_NS}icon`,
  type: `${SOLID_PRODUCTIVITY_NS}type`,
  isTrackStreaks: `${SOLID_PRODUCTIVITY_NS}isTrackStreaks`,
  streakMinValue: `${SOLID_PRODUCTIVITY_NS}streakMinValue`,
  streakMode: `${SOLID_PRODUCTIVITY_NS}streakMode`,
  streakWeeklyFrequency: `${SOLID_PRODUCTIVITY_NS}streakWeeklyFrequency`,
  countdownDuration: `${SOLID_PRODUCTIVITY_NS}countdownDuration`,
  order: `${SOLID_PRODUCTIVITY_NS}order`,
  countOnDay: `${SOLID_PRODUCTIVITY_NS}countOnDay`,
  counterData: `${SOLID_PRODUCTIVITY_NS}counterData`,
} as const;

export const SP_METRIC = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  notes: `${SOLID_PRODUCTIVITY_NS}notes`,
  remindTomorrow: `${SOLID_PRODUCTIVITY_NS}remindTomorrow`,
  impactOfWork: `${SOLID_PRODUCTIVITY_NS}impactOfWork`,
  energyCheckin: `${SOLID_PRODUCTIVITY_NS}energyCheckin`,
  totalWorkMinutes: `${SOLID_PRODUCTIVITY_NS}totalWorkMinutes`,
  completedTasks: `${SOLID_PRODUCTIVITY_NS}completedTasks`,
  plannedTasks: `${SOLID_PRODUCTIVITY_NS}plannedTasks`,
  focusSessions: `${SOLID_PRODUCTIVITY_NS}focusSessions`,
  reflections: `${SOLID_PRODUCTIVITY_NS}reflections`,
  metricData: `${SOLID_PRODUCTIVITY_NS}metricData`,
} as const;

export const SP_BOARD = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  title: `${SOLID_PRODUCTIVITY_NS}title`,
  cols: `${SOLID_PRODUCTIVITY_NS}cols`,
  order: `${SOLID_PRODUCTIVITY_NS}order`,
  panels: `${SOLID_PRODUCTIVITY_NS}panels`,
  boardData: `${SOLID_PRODUCTIVITY_NS}boardData`,
} as const;

export const SP_GLOBAL_CONFIG = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  configData: `${SOLID_PRODUCTIVITY_NS}configData`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_MENU_TREE = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  projectTree: `${SOLID_PRODUCTIVITY_NS}projectTree`,
  tagTree: `${SOLID_PRODUCTIVITY_NS}tagTree`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_TIME_TRACKING = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  contextType: `${SOLID_PRODUCTIVITY_NS}contextType`,
  contextId: `${SOLID_PRODUCTIVITY_NS}contextId`,
  date: `${SOLID_PRODUCTIVITY_NS}date`,
  data: `${SOLID_PRODUCTIVITY_NS}timeTrackingData`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_PLUGIN_USER_DATA = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  data: `${SOLID_PRODUCTIVITY_NS}pluginUserDataPayload`,
  userData: `${SOLID_PRODUCTIVITY_NS}pluginUserData`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;

export const SP_PLUGIN_METADATA = {
  id: `${SOLID_PRODUCTIVITY_NS}id`,
  isEnabled: `${SOLID_PRODUCTIVITY_NS}isEnabled`,
  metadataData: `${SOLID_PRODUCTIVITY_NS}pluginMetadata`,
  updated: `${SOLID_PRODUCTIVITY_NS}updated`,
} as const;
