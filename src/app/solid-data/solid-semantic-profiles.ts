import type {
  CreateThingInput,
  RuntimeFieldInput,
  RuntimeFieldScalar,
  RuntimeFieldValue,
  RuntimeTypeRegistration,
  RuntimeTypedThing,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
} from '@solid-intents/runtime';
import {
  ICAL_TASK,
  ICAL_VTODO_CLASS,
  SOLID_PRODUCTIVITY_APP_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
  SOLID_PRODUCTIVITY_BOARD_TYPE,
  SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
  SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
  SOLID_PRODUCTIVITY_LAYOUT,
  SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS,
  SOLID_PRODUCTIVITY_MENU_TREE_TYPE,
  SOLID_PRODUCTIVITY_METRIC_TYPE,
  SOLID_PRODUCTIVITY_NOTE_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
  SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE,
  SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE,
  SOLID_PRODUCTIVITY_PROJECT_TYPE,
  SOLID_PRODUCTIVITY_SECTION_TYPE,
  SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
  SOLID_PRODUCTIVITY_TAG_TYPE,
  SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE,
  SP_APP_STATE,
  SP_ARCHIVE_STATE,
  SP_ARCHIVED_TASK,
  SP_BOARD,
  SP_GLOBAL_CONFIG,
  SP_ISSUE_PROVIDER,
  SP_MENU_TREE,
  SP_METRIC,
  SP_NOTE,
  SP_PLANNER_DAY,
  SP_PLANNER_STATE,
  SP_PLUGIN_METADATA,
  SP_PLUGIN_USER_DATA,
  SP_PROJECT,
  SP_SECTION,
  SP_SIMPLE_COUNTER,
  SP_TAG,
  SP_TASK,
  SP_TASK_REPEAT_CFG,
  SP_TIME_TRACKING,
  SCHEMA_THING,
} from './solid-productivity-vocab';

type FieldKind = RuntimeFieldInput['valueType'];
type PredicateRecord = Readonly<Record<string, string>>;

const field = (
  predicateUri: string,
  valueType: FieldKind,
  multiple = false,
): RuntimeFieldInput => ({ predicateUri, valueType, multiple });

const fields = (
  predicates: PredicateRecord,
  kinds: Partial<Record<keyof typeof predicates, FieldKind>>,
  multiple: readonly string[] = [],
  excluded: readonly string[] = [],
): Readonly<Record<string, RuntimeFieldInput>> =>
  Object.fromEntries(
    Object.entries(predicates)
      .filter(([name]) => !excluded.includes(name))
      .map(([name, predicateUri]) => [
        safeFieldName(name),
        field(predicateUri, kinds[name] ?? 'string', multiple.includes(name)),
      ]),
  );

const safeFieldName = (name: string): string =>
  name === 'type' ? 'counterType' : name === 'title' ? 'appTitle' : name;

const profile = (
  type: string,
  customFields: Readonly<Record<string, RuntimeFieldInput>>,
): RuntimeTypeRegistration => {
  const layoutType = SOLID_PRODUCTIVITY_LAYOUT.types[type];
  if (layoutType === undefined || layoutType.classUri === undefined) {
    throw new Error(`Missing Solid layout type ${type}`);
  }
  return {
    type,
    classUri: layoutType.classUri,
    classUris: layoutType.classUris,
    fields: customFields,
  };
};

const JSON_FIELDS = {
  task: ['attachments', 'timeSpentOnDay', 'issueTimeTracked', 'issueLastSyncedValues'],
  project: ['theme', 'advancedCfg', 'issueIntegrationCfgs'],
  tag: ['theme', 'advancedCfg'],
  issueProvider: ['providerData'],
  repeatCfg: ['repeatCfgData'],
  archivedTask: ['taskData'],
  archiveState: ['timeTracking'],
  simpleCounter: ['countOnDay', 'counterData'],
  metric: ['focusSessions', 'reflections', 'metricData'],
  board: ['panels', 'boardData'],
  globalConfig: ['configData'],
  menuTree: ['projectTree', 'tagTree'],
  timeTracking: ['data'],
  pluginUserData: ['userData'],
  pluginMetadata: ['metadataData'],
} as const;

/** Runtime-local profiles. Persisted JSON stays on explicit RDF operations. */
export const SOLID_SEMANTIC_PROFILES: readonly RuntimeTypeRegistration[] = [
  {
    type: SOLID_PRODUCTIVITY_TASK_TYPE,
    classUri: ICAL_VTODO_CLASS,
    classUris: [SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS],
    fields: {
      ...fields(
        SP_TASK,
        {
          isDone: 'boolean',
          created: 'number',
          modified: 'number',
          doneOn: 'number',
          timeSpent: 'number',
          timeEstimate: 'number',
          dueWithTime: 'number',
          hasPlannedTime: 'boolean',
          deadlineWithTime: 'number',
          deadlineRemindAt: 'number',
          remindAt: 'number',
          issueWasUpdated: 'boolean',
          issueLastUpdated: 'number',
          issueAttachmentNr: 'number',
          issuePoints: 'number',
          hideSubTasksMode: 'number',
        },
        ['subTaskId', 'tagId'],
        JSON_FIELDS.task,
      ),
    },
  },
  profile(
    SOLID_PRODUCTIVITY_PROJECT_TYPE,
    fields(
      SP_PROJECT,
      {
        isArchived: 'boolean',
        isDone: 'boolean',
        doneOn: 'number',
        isHiddenFromMenu: 'boolean',
        isEnableBacklog: 'boolean',
        created: 'number',
        updated: 'number',
      },
      ['taskId', 'backlogTaskId', 'noteId'],
      JSON_FIELDS.project,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_TAG_TYPE,
    fields(SP_TAG, { created: 'number', updated: 'number' }, ['taskId'], JSON_FIELDS.tag),
  ),
  profile(
    SOLID_PRODUCTIVITY_NOTE_TYPE,
    fields(SP_NOTE, {
      isPinnedToToday: 'boolean',
      isLock: 'boolean',
      created: 'number',
      modified: 'number',
    }),
  ),
  profile(
    SOLID_PRODUCTIVITY_APP_STATE_TYPE,
    fields(SP_APP_STATE, { updated: 'number' }, [
      'projectOrder',
      'tagOrder',
      'noteTodayOrder',
      'sectionOrder',
    ]),
  ),
  profile(
    SOLID_PRODUCTIVITY_SECTION_TYPE,
    fields(SP_SECTION, { isExpanded: 'boolean' }, ['taskId']),
  ),
  profile(
    SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
    fields(
      SP_ISSUE_PROVIDER,
      { isEnabled: 'boolean', order: 'number' },
      [],
      JSON_FIELDS.issueProvider,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
    fields(
      SP_TASK_REPEAT_CFG,
      { isPaused: 'boolean', order: 'number' },
      ['tagId'],
      JSON_FIELDS.repeatCfg,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
    fields(
      SP_ARCHIVED_TASK,
      { doneOn: 'number' },
      ['subTaskId', 'tagId'],
      JSON_FIELDS.archivedTask,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
    fields(
      SP_ARCHIVE_STATE,
      { lastTimeTrackingFlush: 'number', updated: 'number' },
      [],
      JSON_FIELDS.archiveState,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
    fields(SP_PLANNER_DAY, { updated: 'number' }, ['taskId']),
  ),
  profile(
    SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
    fields(SP_PLANNER_STATE, {
      addPlannedTasksDialogLastShown: 'number',
      updated: 'number',
    }),
  ),
  profile(
    SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
    fields(
      SP_SIMPLE_COUNTER,
      {
        isEnabled: 'boolean',
        isHideButton: 'boolean',
        isTrackStreaks: 'boolean',
        streakMinValue: 'number',
        streakWeeklyFrequency: 'number',
        countdownDuration: 'number',
        order: 'number',
      },
      [],
      JSON_FIELDS.simpleCounter,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_METRIC_TYPE,
    fields(
      SP_METRIC,
      {
        remindTomorrow: 'boolean',
        impactOfWork: 'number',
        energyCheckin: 'number',
        totalWorkMinutes: 'number',
        completedTasks: 'number',
        plannedTasks: 'number',
      },
      [],
      JSON_FIELDS.metric,
    ),
  ),
  profile(
    SOLID_PRODUCTIVITY_BOARD_TYPE,
    fields(SP_BOARD, { cols: 'number', order: 'number' }, [], JSON_FIELDS.board),
  ),
  profile(
    SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
    fields(SP_GLOBAL_CONFIG, { updated: 'number' }, [], JSON_FIELDS.globalConfig),
  ),
  profile(
    SOLID_PRODUCTIVITY_MENU_TREE_TYPE,
    fields(SP_MENU_TREE, { updated: 'number' }, [], JSON_FIELDS.menuTree),
  ),
  profile(
    SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE,
    fields(SP_TIME_TRACKING, { updated: 'number' }, [], JSON_FIELDS.timeTracking),
  ),
  profile(
    SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE,
    fields(SP_PLUGIN_USER_DATA, { updated: 'number' }, [], JSON_FIELDS.pluginUserData),
  ),
  profile(
    SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE,
    fields(
      SP_PLUGIN_METADATA,
      { isEnabled: 'boolean', updated: 'number' },
      [],
      JSON_FIELDS.pluginMetadata,
    ),
  ),
];

const profilesByType = new Map(
  SOLID_SEMANTIC_PROFILES.map((item) => [item.type, item] as const),
);
const fieldsByTypeAndPredicate = new Map(
  SOLID_SEMANTIC_PROFILES.map(
    (item) =>
      [
        item.type,
        new Map(
          Object.entries(item.fields ?? {}).flatMap(([name, definition]) =>
            [definition.predicateUri, ...(definition.readAliases ?? [])].map(
              (predicate) => [predicate, { name, definition }] as const,
            ),
          ),
        ),
      ] as const,
  ),
);
const taskFieldDefinitions = fieldsByTypeAndPredicate.get(SOLID_PRODUCTIVITY_TASK_TYPE);
taskFieldDefinitions?.set(ICAL_TASK.summary, {
  name: 'title',
  definition: field(ICAL_TASK.summary, 'string'),
});
taskFieldDefinitions?.set(SCHEMA_THING.status, {
  name: 'status',
  definition: field(SCHEMA_THING.status, 'string'),
});
taskFieldDefinitions?.set(ICAL_TASK.due, {
  name: 'dueDate',
  definition: field(ICAL_TASK.due, 'dateTime'),
});

type SemanticViewResolver = (type: string) => { read(value: Thing): RuntimeTypedThing };

let semanticViewResolver: SemanticViewResolver | null = null;
let degradationReporter: ((type: string) => void) | null = null;
const reportedDegradation = new WeakSet<Thing>();

export const installSolidSemanticViewResolver = (
  resolver: SemanticViewResolver,
  reportDegradation: (type: string) => void,
): void => {
  semanticViewResolver = resolver;
  degradationReporter = reportDegradation;
};

export const solidSemanticValue = (
  thing: Thing,
  predicate: string,
): RuntimeFieldValue | undefined => {
  if (semanticViewResolver === null) {
    return undefined;
  }
  const type = semanticType(thing);
  if (type === undefined) {
    return undefined;
  }
  const fieldName = fieldsByTypeAndPredicate.get(type)?.get(predicate)?.name;
  if (fieldName === undefined) {
    return undefined;
  }
  const value = semanticViewResolver(type).read(thing).fields[fieldName];
  if (
    value === undefined &&
    thing.property(predicate).length > 0 &&
    !reportedDegradation.has(thing)
  ) {
    reportedDegradation.add(thing);
    degradationReporter?.(type);
  }
  return value;
};

export const normalizeSolidCreateInput = (input: CreateThingInput): CreateThingInput => {
  const type = profileType(input.profile) ?? input.type;
  if (type === undefined) {
    return input;
  }
  const extracted = extractSemanticProperties(type, input.properties);
  const title = input.title ?? input.facets?.title;
  const status = input.facets?.status;
  return compact({
    ...input,
    title: undefined,
    facets: undefined,
    fields: {
      ...extracted.fields,
      ...input.fields,
      ...(title === undefined ? {} : { title }),
      ...(status === undefined ? {} : { status }),
    },
    properties: withoutTaskTitleAlias(type, extracted.properties),
  });
};

export const normalizeSolidChanges = (
  type: string,
  changes: ThingChanges,
): ThingChanges => {
  const replaced = extractSemanticProperties(type, changes.replaceProperties);
  const inserted = extractSemanticProperties(type, changes.properties);
  const deleted = extractSemanticProperties(type, changes.deleteProperties, true);
  const title =
    typeof changes['title'] === 'string' ? changes['title'] : changes.facets?.title;
  const status =
    typeof changes['status'] === 'string' ? changes['status'] : changes.facets?.status;
  return compact({
    ...changes,
    title: undefined,
    status: undefined,
    facets: undefined,
    fields: {
      ...replaced.fields,
      ...inserted.fields,
      ...deleted.fields,
      ...changes.fields,
      ...(title === undefined ? {} : { title }),
      ...(status === undefined ? {} : { status }),
    },
    properties: inserted.properties,
    replaceProperties: withoutTaskTitleAlias(type, replaced.properties),
    deleteProperties: deleted.properties,
  });
};

const extractSemanticProperties = (
  type: string,
  properties: ThingRdfPropertyInput | undefined,
  deleting = false,
): {
  fields: Readonly<Record<string, RuntimeFieldValue | null>>;
  properties: ThingRdfPropertyInput | undefined;
} => {
  if (properties === undefined) {
    return { fields: {}, properties: undefined };
  }
  const definitions = fieldsByTypeAndPredicate.get(type);
  const semanticFields: Record<string, RuntimeFieldValue | null> = {};
  const raw: Record<string, ThingRdfPropertyInput[string]> = {};
  for (const [predicate, values] of Object.entries(properties)) {
    const registered = definitions?.get(predicate);
    if (registered === undefined) {
      raw[predicate] = values;
      continue;
    }
    const converted = values.map(fieldValue).filter(isFieldScalar);
    semanticFields[registered.name] = deleting
      ? null
      : registered.definition.multiple
        ? converted
        : (converted[0] ?? null);
  }
  return {
    fields: semanticFields,
    properties: Object.keys(raw).length === 0 ? undefined : raw,
  };
};

const withoutTaskTitleAlias = (
  type: string,
  properties: ThingRdfPropertyInput | undefined,
): ThingRdfPropertyInput | undefined => {
  if (type !== SOLID_PRODUCTIVITY_TASK_TYPE || properties === undefined) {
    return properties;
  }
  const remaining = Object.fromEntries(
    Object.entries(properties).filter(([predicate]) => predicate !== SCHEMA_THING.title),
  );
  return Object.keys(remaining).length === 0 ? undefined : remaining;
};

const fieldValue = (
  value: ThingRdfPropertyInput[string][number],
): RuntimeFieldScalar | undefined => {
  if (value instanceof Date || typeof value !== 'object') {
    return value;
  }
  if (value.kind === 'uri') {
    return value.uri;
  }
  if (value.kind === 'literal') {
    return value.value;
  }
  return undefined;
};

const isFieldScalar = (value: unknown): value is string | number | boolean | Date =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value instanceof Date;

const semanticType = (thing: Thing): string | undefined =>
  thing.types.find((candidate) => profilesByType.has(candidate));

const profileType = (inputProfile: CreateThingInput['profile']): string | undefined =>
  typeof inputProfile === 'string' ? inputProfile : inputProfile?.type;

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

export const projectSolidThing = (
  thing: Thing,
  viewFor: (type: string) => { read(value: Thing): RuntimeTypedThing },
): RuntimeTypedThing => {
  const type = thing.types.find((candidate) =>
    SOLID_SEMANTIC_PROFILES.some((item) => item.type === candidate),
  );
  return type === undefined ? { thing, fields: {} } : viewFor(type).read(thing);
};
