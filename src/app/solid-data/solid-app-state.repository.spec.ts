import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { SP_APP_STATE } from './solid-productivity-vocab';
import {
  SOLID_APP_STATE_ID,
  SOLID_APP_STATE_RESOURCE_NAME,
} from './solid-app-state.mapper';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidAppStateRepository', () => {
  let discovery: {
    start: jasmine.Spy;
  };
  let things: {
    query: jasmine.Spy;
    create: jasmine.Spy;
  };
  let writes: {
    planUpdate: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    discovery = jasmine.createSpyObj('discovery', ['start']);
    things = jasmine.createSpyObj('things', ['query', 'create']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          app: 'https://pod.example/super-productivity/app/',
        },
        types: {
          SuperProductivityAppState: {
            name: 'App state',
            type: 'SuperProductivityAppState',
            target: {
              containerUri: 'https://pod.example/super-productivity/app/',
            },
          },
        },
      }),
      appStateProfile: {
        name: 'App state',
        type: 'SuperProductivityAppState',
        target: {
          containerUri: 'https://pod.example/super-productivity/app/',
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

  it('loads the app-state thing by stable RDF id', async () => {
    const existingThing = createThing({
      projectOrder: ['project-2', 'project-1'],
    });
    things.query.and.resolveTo({ things: [existingThing] });

    const loaded = await TestBed.inject(SolidAppStateRepository).loadAppState();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        where: [
          {
            kind: 'property',
            predicateUri: SP_APP_STATE.id,
            value: SOLID_APP_STATE_ID,
          },
        ],
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/app/',
        },
      }),
    );
    expect(loaded.value?.projectOrder).toEqual(['project-2', 'project-1']);
  });

  it('creates deterministic app-state resources when no state exists', async () => {
    const createdThing = createThing({
      sectionOrder: ['section-1'],
      tagOrder: ['TODAY', 'tag-1'],
    });
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createdThing);

    await TestBed.inject(SolidAppStateRepository).saveAppStateOrder({
      sectionOrder: ['section-1'],
      tagOrder: ['TODAY', 'tag-1'],
    });

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/app/',
          resourceName: SOLID_APP_STATE_RESOURCE_NAME,
        },
        properties: jasmine.objectContaining({
          [SP_APP_STATE.id]: [SOLID_APP_STATE_ID],
          [SP_APP_STATE.sectionOrder]: ['section-1'],
          [SP_APP_STATE.tagOrder]: ['TODAY', 'tag-1'],
        }),
      }),
    );
  });

  it('commits app-state updates through the runtime write plan API', async () => {
    const existingThing = createThing({
      projectOrder: ['project-1'],
      sectionOrder: ['section-1'],
      tagOrder: ['TODAY', 'tag-1'],
    });
    const updatedThing = createThing({
      projectOrder: ['project-1'],
      sectionOrder: ['section-2', 'section-1'],
      tagOrder: ['TODAY', 'tag-1'],
    });
    const plan = {
      version: 1,
      id: 'write-plan-1',
      kind: 'thing.update',
      request: {
        kind: 'thing.update',
        uri: existingThing.uri,
        changes: {},
      },
      operations: [],
      affectedResources: [],
      preconditions: [],
      diagnostics: [],
    } as RuntimeWritePlan;

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const saved = await TestBed.inject(SolidAppStateRepository).saveAppStateOrder({
      sectionOrder: ['section-2', 'section-1'],
    });

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.objectContaining({
          [SP_APP_STATE.projectOrder]: ['project-1'],
          [SP_APP_STATE.sectionOrder]: ['section-2', 'section-1'],
          [SP_APP_STATE.tagOrder]: ['TODAY', 'tag-1'],
        }),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.sectionOrder).toEqual(['section-2', 'section-1']);
  });
});

const createThing = (
  orders: Partial<{
    noteTodayOrder: string[];
    projectOrder: string[];
    sectionOrder: string[];
    tagOrder: string[];
  }>,
): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_APP_STATE.id]: [literal(SOLID_APP_STATE_ID)],
    [SP_APP_STATE.projectOrder]: (orders.projectOrder ?? []).map(literal),
    [SP_APP_STATE.sectionOrder]: (orders.sectionOrder ?? []).map(literal),
    [SP_APP_STATE.tagOrder]: (orders.tagOrder ?? []).map(literal),
    [SP_APP_STATE.noteTodayOrder]: (orders.noteTodayOrder ?? []).map(literal),
    [SP_APP_STATE.updated]: [literal(1710000000000)],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/app/state.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/app/state.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/app/state.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityAppState'],
    facets: {
      title: 'Super Productivity app state',
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
