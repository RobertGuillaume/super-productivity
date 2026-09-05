import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { SOLID_PLANNER_STATE_ID } from './solid-planner.mapper';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SP_PLANNER_DAY, SP_PLANNER_STATE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidPlannerRepository', () => {
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
  let discovery: {
    start: jasmine.Spy;
  };

  beforeEach(() => {
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);
    discovery = jasmine.createSpyObj('discovery', ['start']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          planner: 'https://pod.example/super-productivity/planner/',
        },
        types: {
          SuperProductivityPlannerDay: {
            name: 'Planner day',
            type: 'SuperProductivityPlannerDay',
            target: {
              containerUri: 'https://pod.example/super-productivity/planner/',
            },
          },
          SuperProductivityPlannerState: {
            name: 'Planner state',
            type: 'SuperProductivityPlannerState',
            target: {
              containerUri: 'https://pod.example/super-productivity/planner/',
            },
          },
        },
      }),
      plannerDayProfile: {
        name: 'Planner day',
        type: 'SuperProductivityPlannerDay',
        target: {
          containerUri: 'https://pod.example/super-productivity/planner/',
        },
      },
      plannerStateProfile: {
        name: 'Planner state',
        type: 'SuperProductivityPlannerState',
        target: {
          containerUri: 'https://pod.example/super-productivity/planner/',
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

  it('loads planner days and singleton state from the planner container', async () => {
    things.query.and.callFake((query: { type: string }) => {
      if (query.type === 'SuperProductivityPlannerDay') {
        return Promise.resolve({
          things: [createPlannerDayThing('2026-08-04', ['task-1'])],
        });
      }
      return Promise.resolve({
        things: [createPlannerStateThing('2026-08-04')],
      });
    });

    const plannerState = await TestBed.inject(SolidPlannerRepository).loadPlannerState();

    expect(discovery.start).toHaveBeenCalledOnceWith({
      entrypoints: ['https://pod.example/super-productivity/planner/'],
      mode: 'balanced',
    });
    expect(plannerState).toEqual({
      days: {
        ['2026-08-04']: ['task-1'],
      },
      addPlannedTasksDialogLastShown: '2026-08-04',
    });
  });

  it('creates missing planner days with deterministic resource names', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createPlannerDayThing('2026-08-04', ['task-1']));

    await TestBed.inject(SolidPlannerRepository).savePlannerDay({
      day: '2026-08-04',
      taskIds: ['task-1'],
      updated: 1710000000000,
    });

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/planner/',
          resourceName: '2026-08-04',
        },
      }),
    );
  });

  it('commits existing planner day updates through the runtime write plan API', async () => {
    const existingThing = createPlannerDayThing('2026-08-04', ['task-1']);
    const plan = {
      id: 'write-plan-1',
      kind: 'thing.update',
      request: {
        kind: 'thing.update',
        uri: existingThing.uri,
        changes: {},
      },
      operations: [],
      affectedResources: [],
      diagnostics: [],
    } as RuntimeWritePlan;

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: createPlannerDayThing('2026-08-04', ['task-2']),
    });

    const saved = await TestBed.inject(SolidPlannerRepository).savePlannerDay({
      day: '2026-08-04',
      taskIds: ['task-2'],
      updated: 1710000000000,
    });

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.taskIds).toEqual(['task-2']);
  });

  it('reconciles only planner days whose task order changed', async () => {
    const unchangedThing = createPlannerDayThing('2026-08-04', ['task-1']);
    const changedThing = createPlannerDayThing('2026-08-05', ['task-1', 'task-2']);
    const plan = {
      id: 'write-plan-2',
      kind: 'thing.update',
      request: {
        kind: 'thing.update',
        uri: changedThing.uri,
        changes: {},
      },
      operations: [],
      affectedResources: [],
      diagnostics: [],
    } as RuntimeWritePlan;
    things.query.and.resolveTo({ things: [unchangedThing, changedThing] });
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: createPlannerDayThing('2026-08-05', ['task-2', 'task-1']),
    });

    await TestBed.inject(SolidPlannerRepository).reconcilePlannerDays({
      days: {
        ['2026-08-04']: ['task-1'],
        ['2026-08-05']: ['task-2', 'task-1'],
      },
      addPlannedTasksDialogLastShown: undefined,
    });

    expect(things.query).toHaveBeenCalledTimes(1);
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      changedThing.uri,
      jasmine.objectContaining({ replaceProperties: jasmine.any(Object) }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(things.create).not.toHaveBeenCalled();
    expect(things.delete).not.toHaveBeenCalled();
  });

  it('deletes planner day resources through the runtime', async () => {
    const existingThing = createPlannerDayThing('2026-08-04', ['task-1']);
    things.query.and.resolveTo({ things: [existingThing] });
    things.delete.and.resolveTo(undefined);

    await TestBed.inject(SolidPlannerRepository).deletePlannerDay('2026-08-04');

    expect(things.delete).toHaveBeenCalledOnceWith(existingThing.uri);
  });
});

const createPlannerDayThing = (day: string, taskIds: string[]): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_PLANNER_DAY.day]: [literal(day)],
    [SP_PLANNER_DAY.taskId]: taskIds.map(literal),
    [SP_PLANNER_DAY.updated]: [literal(1710000000000)],
  };
  return createThing('SuperProductivityPlannerDay', day, properties);
};

const createPlannerStateThing = (
  addPlannedTasksDialogLastShown: string | undefined,
): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_PLANNER_STATE.id]: [literal(SOLID_PLANNER_STATE_ID)],
    [SP_PLANNER_STATE.updated]: [literal(1710000000100)],
    ...(addPlannedTasksDialogLastShown
      ? {
          [SP_PLANNER_STATE.addPlannedTasksDialogLastShown]: [
            literal(addPlannedTasksDialogLastShown),
          ],
        }
      : {}),
  };
  return createThing(
    'SuperProductivityPlannerState',
    'Super Productivity planner state',
    properties,
  );
};

const createThing = (
  type: string,
  title: string,
  properties: Readonly<Record<string, readonly RdfValue[]>>,
): Thing => {
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/planner/${title}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/planner/${title}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/planner/${title}.ttl`,
      kind: 'runtime-managed',
    },
    types: [type],
    facets: {
      title,
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
