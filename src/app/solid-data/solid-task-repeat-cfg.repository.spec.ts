import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { RDF_JSON_DATATYPE, SP_TASK_REPEAT_CFG } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import {
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidTaskRepeatCfgRepository', () => {
  const taskRepeatCfg: TaskRepeatCfg = {
    ...DEFAULT_TASK_REPEAT_CFG,
    id: 'repeat-cfg-1',
    projectId: 'project-1',
    title: 'Repeat through a write plan',
    tagIds: ['tag-1'],
    order: 1,
  };

  let discovery: {
    start: jasmine.Spy;
  };
  let things: {
    query: jasmine.Spy;
    create: jasmine.Spy;
    delete: jasmine.Spy;
    subscribe: jasmine.Spy;
  };
  let writes: {
    planUpdate: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    discovery = jasmine.createSpyObj('discovery', ['start']);
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);
    installRuntimeWritePlanBridge(writes, things);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          taskRepeatCfgs: 'https://pod.example/super-productivity/repeat-configs/',
        },
        types: {
          SuperProductivityTaskRepeatCfg: {
            name: 'Task repeat config',
            type: 'SuperProductivityTaskRepeatCfg',
            target: {
              containerUri: 'https://pod.example/super-productivity/repeat-configs/',
            },
          },
        },
      }),
      taskRepeatCfgProfile: {
        name: 'Task repeat config',
        type: 'SuperProductivityTaskRepeatCfg',
        target: {
          containerUri: 'https://pod.example/super-productivity/repeat-configs/',
        },
      },
      client: {
        discovery,
        things,
        writes,
      },
    } as unknown as SolidRuntimeService;

    TestBed.configureTestingModule({
      providers: [{ provide: SolidRuntimeService, useValue: solidRuntime }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads task repeat configs from the configured Solid container', async () => {
    things.query.and.resolveTo({ things: [createThing(taskRepeatCfg)] });

    const taskRepeatCfgs = await TestBed.inject(
      SolidTaskRepeatCfgRepository,
    ).loadTaskRepeatCfgs();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityTaskRepeatCfg',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/repeat-configs/',
        },
      }),
    );
    expect(taskRepeatCfgs.value[0]).toEqual(taskRepeatCfg);
  });

  it('creates deterministic task repeat config resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(taskRepeatCfg));

    await TestBed.inject(SolidTaskRepeatCfgRepository).saveTaskRepeatCfg(taskRepeatCfg);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/repeat-configs/',
          resourceName: 'repeat-cfg-1',
        },
        properties: jasmine.objectContaining({
          [SP_TASK_REPEAT_CFG.id]: ['repeat-cfg-1'],
          [SP_TASK_REPEAT_CFG.tagId]: ['tag-1'],
        }),
      }),
    );
  });

  it('commits existing task repeat config updates through the runtime write plan API', async () => {
    const existingThing = createThing(taskRepeatCfg);
    const updatedThing = createThing({
      ...taskRepeatCfg,
      title: 'Updated repeat title',
    });
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidTaskRepeatCfgRepository);
    await repository.loadTaskRepeatCfgs();
    const saved = await repository.saveTaskRepeatCfg(taskRepeatCfg);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        fields: jasmine.objectContaining({
          id: taskRepeatCfg.id,
          appTitle: taskRepeatCfg.title,
          projectId: taskRepeatCfg.projectId,
        }),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated repeat title');
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
    uri: `https://pod.example/super-productivity/repeat-configs/${taskRepeatCfg.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/repeat-configs/${taskRepeatCfg.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/repeat-configs/${taskRepeatCfg.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTaskRepeatCfg'],
    facets: {
      title: taskRepeatCfg.title ?? 'Repeat task',
      status: taskRepeatCfg.isPaused ? 'paused' : 'active',
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
