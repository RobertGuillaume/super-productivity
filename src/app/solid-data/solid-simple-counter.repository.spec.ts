import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import {
  SimpleCounter,
  SimpleCounterType,
} from '../features/simple-counter/simple-counter.model';
import { RDF_JSON_DATATYPE, SP_SIMPLE_COUNTER } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';

describe('SolidSimpleCounterRepository', () => {
  const TODAY = '2026-08-04';
  const simpleCounter: SimpleCounter = {
    id: 'counter-1',
    title: 'Deep work',
    isEnabled: true,
    icon: 'timer',
    type: SimpleCounterType.StopWatch,
    countOnDay: {
      [TODAY]: 120000,
    },
    isOn: false,
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

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          simpleCounters: 'https://pod.example/super-productivity/simple-counters/',
        },
        types: {
          SuperProductivitySimpleCounter: {
            name: 'Simple counter',
            type: 'SuperProductivitySimpleCounter',
            target: {
              containerUri: 'https://pod.example/super-productivity/simple-counters/',
            },
          },
        },
      }),
      simpleCounterProfile: {
        name: 'Simple counter',
        type: 'SuperProductivitySimpleCounter',
        target: {
          containerUri: 'https://pod.example/super-productivity/simple-counters/',
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

  it('loads simple counters from the configured Solid container in order', async () => {
    const first = createThing({ ...simpleCounter, id: 'counter-1' }, 2);
    const second = createThing({ ...simpleCounter, id: 'counter-2' }, 1);
    things.query.and.resolveTo({ things: [first, second] });

    const simpleCounters = await TestBed.inject(
      SolidSimpleCounterRepository,
    ).loadSimpleCounters();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivitySimpleCounter',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/simple-counters/',
        },
      }),
    );
    expect(simpleCounters.value.map((counter) => counter.id)).toEqual([
      'counter-2',
      'counter-1',
    ]);
  });

  it('creates deterministic simple counter resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(simpleCounter, 3));

    await TestBed.inject(SolidSimpleCounterRepository).saveSimpleCounter(
      simpleCounter,
      3,
    );

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/simple-counters/',
          resourceName: 'counter-1',
        },
        properties: jasmine.objectContaining({
          [SP_SIMPLE_COUNTER.id]: ['counter-1'],
          [SP_SIMPLE_COUNTER.title]: ['Deep work'],
          [SP_SIMPLE_COUNTER.order]: [3],
        }),
      }),
    );
  });

  it('commits existing simple counter updates through the runtime write plan API', async () => {
    const existingThing = createThing(simpleCounter, 0);
    const updatedThing = createThing(
      {
        ...simpleCounter,
        title: 'Updated counter',
      },
      0,
    );
    const plan = {
      version: 2,
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

    const repository = TestBed.inject(SolidSimpleCounterRepository);
    await repository.loadSimpleCounters();
    const saved = await repository.saveSimpleCounter(simpleCounter);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated counter');
  });

  it('deletes existing simple counter resources through the runtime delete API', async () => {
    const existingThing = createThing(simpleCounter, 0);
    things.query.and.resolveTo({ things: [existingThing] });
    things.delete.and.resolveTo();

    await TestBed.inject(SolidSimpleCounterRepository).deleteSimpleCounter('counter-1');

    expect(things.delete).toHaveBeenCalledOnceWith(existingThing.uri);
  });

  it('replaces all simple counters and deletes stale resources', async () => {
    const staleThing = createThing({ ...simpleCounter, id: 'stale-counter' }, 0);
    const existingThing = createThing(simpleCounter, 1);
    const newCounter = {
      ...simpleCounter,
      id: 'counter-2',
      title: 'Fresh counter',
    };
    const plan = {
      version: 2,
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

    things.query.and.returnValues(
      Promise.resolve({ things: [staleThing, existingThing] }),
      Promise.resolve({ things: [staleThing] }),
      Promise.resolve({ things: [existingThing] }),
      Promise.resolve({ things: [] }),
    );
    things.delete.and.resolveTo();
    things.create.and.resolveTo(createThing(newCounter, 1));
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: existingThing,
    });

    await TestBed.inject(SolidSimpleCounterRepository).replaceSimpleCounters([
      simpleCounter,
      newCounter,
    ]);

    expect(things.delete).toHaveBeenCalledOnceWith(staleThing.uri);
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: jasmine.objectContaining({
          resourceName: 'counter-2',
        }),
      }),
    );
  });
});

const createThing = (simpleCounter: SimpleCounter, order: number): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_SIMPLE_COUNTER.id]: [literal(simpleCounter.id)],
    [SP_SIMPLE_COUNTER.title]: [literal(simpleCounter.title)],
    [SP_SIMPLE_COUNTER.isEnabled]: [literal(simpleCounter.isEnabled)],
    [SP_SIMPLE_COUNTER.icon]: [literal(simpleCounter.icon as string)],
    [SP_SIMPLE_COUNTER.type]: [literal(simpleCounter.type)],
    [SP_SIMPLE_COUNTER.order]: [literal(order)],
    [SP_SIMPLE_COUNTER.countOnDay]: [jsonLiteral(simpleCounter.countOnDay)],
    [SP_SIMPLE_COUNTER.counterData]: [jsonLiteral(simpleCounter)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/simple-counters/${simpleCounter.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/simple-counters/${simpleCounter.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/simple-counters/${simpleCounter.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivitySimpleCounter'],
    facets: {
      title: simpleCounter.title,
      status: simpleCounter.isEnabled ? 'active' : 'disabled',
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
