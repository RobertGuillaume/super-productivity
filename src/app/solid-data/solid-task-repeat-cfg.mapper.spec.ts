import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { RDF_JSON_DATATYPE, SP_TASK_REPEAT_CFG } from './solid-productivity-vocab';
import {
  solidThingToTaskRepeatCfg,
  taskRepeatCfgToSolidChanges,
  taskRepeatCfgToSolidCreateInput,
} from './solid-task-repeat-cfg.mapper';

describe('solidTaskRepeatCfg.mapper', () => {
  const taskRepeatCfg: TaskRepeatCfg = {
    ...DEFAULT_TASK_REPEAT_CFG,
    id: 'repeat-cfg-1',
    projectId: 'project-1',
    title: 'Water plants',
    tagIds: ['tag-1'],
    order: 2,
    startDate: '2026-08-03',
    deletedInstanceDates: ['2026-08-10'],
  };

  it('maps a task repeat config to Solid runtime create input', () => {
    const input = taskRepeatCfgToSolidCreateInput(taskRepeatCfg, {
      name: 'Task repeat config',
      type: 'SuperProductivityTaskRepeatCfg',
      target: {
        containerUri: 'https://pod.example/super-productivity/repeat-configs/',
      },
    });

    expect(input.title).toBe('Water plants');
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/repeat-configs/',
      resourceName: 'repeat-cfg-1',
    });
    expect(input.facets?.status).toBe('active');
    expect(input.properties?.[SP_TASK_REPEAT_CFG.id]).toEqual(['repeat-cfg-1']);
    expect(input.properties?.[SP_TASK_REPEAT_CFG.projectId]).toEqual(['project-1']);
    expect(input.properties?.[SP_TASK_REPEAT_CFG.tagId]).toEqual(['tag-1']);
  });

  it('maps task repeat config updates to replacement and deletion RDF changes', () => {
    const changes = taskRepeatCfgToSolidChanges({
      ...taskRepeatCfg,
      projectId: null,
      title: null,
      tagIds: [],
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_TASK_REPEAT_CFG.id]).toEqual(['repeat-cfg-1']);
    expect(changes.replaceProperties?.[SP_TASK_REPEAT_CFG.tagId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TASK_REPEAT_CFG.projectId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TASK_REPEAT_CFG.title]).toEqual([]);
  });

  it('round-trips full repeat config data through RDF JSON', () => {
    const thing = createThing(taskRepeatCfg);

    expect(solidThingToTaskRepeatCfg(thing)).toEqual(taskRepeatCfg);
  });
});

const createThing = (taskRepeatCfg: TaskRepeatCfg): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_TASK_REPEAT_CFG.id]: [literal(taskRepeatCfg.id)],
    [SP_TASK_REPEAT_CFG.projectId]: [literal(taskRepeatCfg.projectId as string)],
    [SP_TASK_REPEAT_CFG.title]: [literal(taskRepeatCfg.title as string)],
    [SP_TASK_REPEAT_CFG.tagId]: taskRepeatCfg.tagIds.map(literal),
    [SP_TASK_REPEAT_CFG.isPaused]: [literal(taskRepeatCfg.isPaused)],
    [SP_TASK_REPEAT_CFG.repeatCycle]: [literal(taskRepeatCfg.repeatCycle)],
    [SP_TASK_REPEAT_CFG.quickSetting]: [literal(taskRepeatCfg.quickSetting)],
    [SP_TASK_REPEAT_CFG.order]: [literal(taskRepeatCfg.order)],
    [SP_TASK_REPEAT_CFG.repeatCfgData]: [jsonLiteral(taskRepeatCfg)],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/repeat-configs/repeat-cfg-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/repeat-configs/repeat-cfg-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/repeat-configs/repeat-cfg-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTaskRepeatCfg'],
    facets: {
      title: taskRepeatCfg.title ?? 'Repeat task',
      status: 'active',
    },
    properties,
    links: {},
    known: {},
    freshness: {
      source: 'pod',
      loadedAt: new Date(0),
    },
    property: (predicateUri: string) => properties[predicateUri] ?? [],
    objects: () => [],
    as: <View>(view: ThingView<View>) => view.read(thing),
  };

  return thing;
};

const literal = (value: RdfLiteralValue['value']): RdfValue => ({
  kind: 'literal',
  value,
});

const jsonLiteral = (value: unknown): RdfValue => ({
  kind: 'literal',
  value: JSON.stringify(value),
  datatype: RDF_JSON_DATATYPE,
});
