import type { ThingWriteProfile } from '@solid-intents/runtime';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import {
  normalizeSolidChanges,
  normalizeSolidCreateInput,
  SOLID_SEMANTIC_PROFILES,
} from './solid-semantic-profiles';
import { taskToSolidChanges, taskToSolidCreateInput } from './solid-task.mapper';
import {
  ICAL_TASK,
  RDF_JSON_DATATYPE,
  SCHEMA_THING,
  SOLID_PRODUCTIVITY_APP_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
  SOLID_PRODUCTIVITY_BOARD_TYPE,
  SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
  SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
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
} from './solid-productivity-vocab';

describe('Solid semantic profiles', () => {
  const profile: ThingWriteProfile = {
    name: 'Task',
    type: SOLID_PRODUCTIVITY_TASK_TYPE,
    target: { containerUri: 'https://pod.example/super-productivity/tasks/' },
  };
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Native task',
    projectId: INBOX_PROJECT.id,
    created: 1_710_000_000_000,
  };

  it('declares every application type with optional typed fields', () => {
    expect(SOLID_SEMANTIC_PROFILES.length).toBe(20);
    expect(
      SOLID_SEMANTIC_PROFILES.flatMap((item) =>
        Object.values(item.fields ?? {}).filter((field) => field.required === true),
      ),
    ).toEqual([]);
  });

  it('declares every non-JSON application predicate exactly once', () => {
    const cases: ReadonlyArray<
      readonly [string, Readonly<Record<string, string>>, readonly string[]]
    > = [
      [
        SOLID_PRODUCTIVITY_TASK_TYPE,
        SP_TASK,
        ['attachments', 'timeSpentOnDay', 'issueTimeTracked', 'issueLastSyncedValues'],
      ],
      [
        SOLID_PRODUCTIVITY_PROJECT_TYPE,
        SP_PROJECT,
        ['theme', 'advancedCfg', 'issueIntegrationCfgs'],
      ],
      [SOLID_PRODUCTIVITY_TAG_TYPE, SP_TAG, ['theme', 'advancedCfg']],
      [SOLID_PRODUCTIVITY_NOTE_TYPE, SP_NOTE, []],
      [SOLID_PRODUCTIVITY_APP_STATE_TYPE, SP_APP_STATE, []],
      [SOLID_PRODUCTIVITY_SECTION_TYPE, SP_SECTION, []],
      [SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE, SP_ISSUE_PROVIDER, ['providerData']],
      [SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE, SP_TASK_REPEAT_CFG, ['repeatCfgData']],
      [SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE, SP_ARCHIVED_TASK, ['taskData']],
      [SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE, SP_ARCHIVE_STATE, ['timeTracking']],
      [SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE, SP_PLANNER_DAY, []],
      [SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE, SP_PLANNER_STATE, []],
      [
        SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
        SP_SIMPLE_COUNTER,
        ['countOnDay', 'counterData'],
      ],
      [
        SOLID_PRODUCTIVITY_METRIC_TYPE,
        SP_METRIC,
        ['focusSessions', 'reflections', 'metricData'],
      ],
      [SOLID_PRODUCTIVITY_BOARD_TYPE, SP_BOARD, ['panels', 'boardData']],
      [SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE, SP_GLOBAL_CONFIG, ['configData']],
      [SOLID_PRODUCTIVITY_MENU_TREE_TYPE, SP_MENU_TREE, ['projectTree', 'tagTree']],
      [SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE, SP_TIME_TRACKING, ['data']],
      [SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE, SP_PLUGIN_USER_DATA, ['userData']],
      [SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE, SP_PLUGIN_METADATA, ['metadataData']],
    ];

    for (const [type, predicates, jsonFields] of cases) {
      const registered = SOLID_SEMANTIC_PROFILES.find((item) => item.type === type);
      const expected = Object.entries(predicates)
        .filter(([name]) => !jsonFields.includes(name))
        .map(([, predicate]) => predicate)
        .sort();
      const actual = Object.values(registered?.fields ?? {})
        .map((field) => field.predicateUri)
        .sort();
      expect(actual).withContext(type).toEqual(expected);
    }
  });

  it('makes fields canonical without duplicating title, status, or RDF edits', () => {
    const input = normalizeSolidCreateInput(taskToSolidCreateInput(task, profile));
    expect(input.title).toBeUndefined();
    expect(input.facets).toBeUndefined();
    expect(input.fields?.['title']).toBe(task.title);
    expect(input.fields?.['status']).toBe('open');
    expect(input.fields?.['id']).toBe(task.id);
    expect(input.properties?.[ICAL_TASK.summary]).toBeUndefined();
    expect(input.properties?.[SCHEMA_THING.title]).toBeUndefined();
    expect(input.properties?.[SP_TASK.attachments]?.[0]).toEqual(
      jasmine.objectContaining({ datatype: RDF_JSON_DATATYPE }),
    );
  });

  it('uses typed nulls for absent declared values while leaving JSON explicit', () => {
    const changes = normalizeSolidChanges(
      SOLID_PRODUCTIVITY_TASK_TYPE,
      taskToSolidChanges(task),
    );
    expect(changes.fields?.['deadlineDay']).toBeNull();
    expect(changes.replaceProperties?.[SP_TASK.attachments]).toBeDefined();
    expect(changes.deleteProperties?.[SP_TASK.deadlineDay]).toBeUndefined();
  });

  it('leaves unknown RDF edits on the source-preserving runtime path', () => {
    const predicate = 'https://example.com/ns#custom';
    const changes = normalizeSolidChanges(SOLID_PRODUCTIVITY_TASK_TYPE, {
      replaceProperties: {
        [predicate]: [{ kind: 'uri', uri: 'https://example.com/value' }],
      },
    });

    expect(changes.replaceProperties?.[predicate]).toEqual([
      { kind: 'uri', uri: 'https://example.com/value' },
    ]);
  });
});
