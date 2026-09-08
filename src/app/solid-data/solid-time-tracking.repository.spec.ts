import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { RDF_JSON_DATATYPE, SP_TIME_TRACKING } from './solid-productivity-vocab';
import {
  SolidTimeTrackingEntry,
  timeTrackingEntryId,
  timeTrackingEntryResourceName,
} from './solid-time-tracking.mapper';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidTimeTrackingRepository', () => {
  const entry: SolidTimeTrackingEntry = {
    id: timeTrackingEntryId('PROJECT', 'project-1', '2026-08-04'),
    contextType: 'PROJECT',
    contextId: 'project-1',
    date: '2026-08-04',
    data: {
      s: 1710000000000,
      e: 1710003600000,
      b: 1,
      bt: 300000,
    },
    updated: 1710000000000,
  };

  let discovery: {
    start: jasmine.Spy;
  };
  let things: {
    query: jasmine.Spy;
    create: jasmine.Spy;
    delete: jasmine.Spy;
  };
  let writes: {
    planUpdate: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    discovery = jasmine.createSpyObj('discovery', ['start']);
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          timeTracking: 'https://pod.example/super-productivity/time-tracking/',
        },
        types: {
          SuperProductivityTimeTracking: {
            name: 'Time tracking',
            type: 'SuperProductivityTimeTracking',
            target: {
              containerUri: 'https://pod.example/super-productivity/time-tracking/',
            },
          },
        },
      }),
      timeTrackingProfile: {
        name: 'Time tracking',
        type: 'SuperProductivityTimeTracking',
        target: {
          containerUri: 'https://pod.example/super-productivity/time-tracking/',
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

  it('loads active time tracking entries into reducer state shape', async () => {
    things.query.and.resolveTo({ things: [createThing(entry)] });

    const loaded = await TestBed.inject(
      SolidTimeTrackingRepository,
    ).loadTimeTrackingState();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(loaded.value.project['project-1']['2026-08-04']).toEqual(entry.data);
    expect(loaded.value.tag).toEqual({});
  });

  it('creates deterministic time tracking resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(entry));

    await TestBed.inject(SolidTimeTrackingRepository).saveTimeTrackingEntry(entry);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/time-tracking/',
          resourceName: timeTrackingEntryResourceName(
            entry.contextType,
            entry.contextId,
            entry.date,
          ),
        },
        properties: jasmine.objectContaining({
          [SP_TIME_TRACKING.id]: [entry.id],
          [SP_TIME_TRACKING.contextType]: [entry.contextType],
          [SP_TIME_TRACKING.contextId]: [entry.contextId],
          [SP_TIME_TRACKING.date]: [entry.date],
          [SP_TIME_TRACKING.data]: [jasmine.any(Object)],
        }),
      }),
    );
  });

  it('commits existing time tracking updates through the runtime write plan API', async () => {
    const existingThing = createThing(entry);
    const updatedEntry: SolidTimeTrackingEntry = {
      ...entry,
      data: {
        ...entry.data,
        e: 1710007200000,
      },
    };
    const updatedThing = createThing(updatedEntry);
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

    const repository = TestBed.inject(SolidTimeTrackingRepository);
    await repository.loadTimeTrackingState();
    const saved = await repository.saveTimeTrackingEntry(entry);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.data.e).toBe(1710007200000);
  });

  it('replaces active time tracking resources with the selected state', async () => {
    const staleEntry: SolidTimeTrackingEntry = {
      ...entry,
      id: timeTrackingEntryId('TAG', 'tag-1', '2026-08-04'),
      contextType: 'TAG',
      contextId: 'tag-1',
      data: {
        s: 1700000000000,
      },
    };
    const existingThing = createThing(entry);
    const staleThing = createThing(staleEntry);
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

    things.query.and.callFake((query: { where?: readonly unknown[] }) =>
      Promise.resolve({
        things:
          query.where === undefined
            ? [existingThing, staleThing]
            : query.where.length > 0
              ? [existingThing]
              : [],
      }),
    );
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: existingThing,
    });
    things.delete.and.resolveTo(undefined);

    await TestBed.inject(SolidTimeTrackingRepository).replaceTimeTrackingState({
      project: {
        ['project-1']: {
          ['2026-08-04']: entry.data,
        },
      },
      tag: {},
    });

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(things.delete).toHaveBeenCalledOnceWith(staleThing.uri);
  });
});

const createThing = (entry: SolidTimeTrackingEntry): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_TIME_TRACKING.id]: [literal(entry.id)],
    [SP_TIME_TRACKING.contextType]: [literal(entry.contextType)],
    [SP_TIME_TRACKING.contextId]: [literal(entry.contextId)],
    [SP_TIME_TRACKING.date]: [literal(entry.date)],
    [SP_TIME_TRACKING.updated]: [literal(entry.updated)],
    [SP_TIME_TRACKING.data]: [jsonLiteral(entry.data)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/time-tracking/${timeTrackingEntryResourceName(
      entry.contextType,
      entry.contextId,
      entry.date,
    )}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/time-tracking/${timeTrackingEntryResourceName(
        entry.contextType,
        entry.contextId,
        entry.date,
      )}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/time-tracking/${timeTrackingEntryResourceName(
        entry.contextType,
        entry.contextId,
        entry.date,
      )}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTimeTracking'],
    facets: {
      title: `${entry.contextType} ${entry.contextId} ${entry.date}`,
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
