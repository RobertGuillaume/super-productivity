import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { RDF_JSON_DATATYPE, SP_ARCHIVE_STATE } from './solid-productivity-vocab';
import {
  archiveStateResourceName,
  SolidArchiveState,
} from './solid-archive-state.mapper';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidArchiveStateRepository', () => {
  const timeTracking: TimeTrackingState = {
    project: {
      ['project-1']: {
        ['2026-08-04']: {
          s: 1710000000000,
          e: 1710003600000,
        },
      },
    },
    tag: {},
  };
  const archiveState: SolidArchiveState = {
    id: archiveStateResourceName('young'),
    bucket: 'young',
    timeTracking,
    lastTimeTrackingFlush: 1710000000000,
    updated: 1710000000100,
  };

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
          archiveState: 'https://pod.example/super-productivity/archive/state/',
        },
        types: {
          SuperProductivityArchiveState: {
            name: 'Archive state',
            type: 'SuperProductivityArchiveState',
            target: {
              containerUri: 'https://pod.example/super-productivity/archive/state/',
            },
          },
        },
      }),
      archiveStateProfile: {
        name: 'Archive state',
        type: 'SuperProductivityArchiveState',
        target: {
          containerUri: 'https://pod.example/super-productivity/archive/state/',
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

  it('loads archive states from the configured Solid container with bucket defaults', async () => {
    things.query.and.resolveTo({ things: [createThing(archiveState)] });

    const loaded = await TestBed.inject(SolidArchiveStateRepository).loadArchiveStates();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityArchiveState',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/archive/state/',
        },
      }),
    );
    expect(loaded.value.young.timeTracking).toEqual(timeTracking);
    expect(loaded.value.old.timeTracking).toEqual({ project: {}, tag: {} });
  });

  it('creates deterministic archive state resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(archiveState));

    await TestBed.inject(SolidArchiveStateRepository).saveArchiveState(archiveState);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/archive/state/',
          resourceName: archiveStateResourceName('young'),
        },
        properties: jasmine.objectContaining({
          [SP_ARCHIVE_STATE.id]: [archiveStateResourceName('young')],
          [SP_ARCHIVE_STATE.bucket]: ['young'],
          [SP_ARCHIVE_STATE.timeTracking]: [jasmine.any(Object)],
        }),
      }),
    );
  });

  it('commits existing archive state updates through the runtime write plan API', async () => {
    const existingThing = createThing(archiveState);
    const updatedArchiveState: SolidArchiveState = {
      ...archiveState,
      lastTimeTrackingFlush: 1710000000200,
    };
    const updatedThing = createThing(updatedArchiveState);
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

    const saved = await TestBed.inject(SolidArchiveStateRepository).saveArchiveState(
      archiveState,
    );

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.lastTimeTrackingFlush).toBe(1710000000200);
  });
});

const createThing = (archiveState: SolidArchiveState): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_ARCHIVE_STATE.id]: [literal(archiveState.id)],
    [SP_ARCHIVE_STATE.bucket]: [literal(archiveState.bucket)],
    [SP_ARCHIVE_STATE.lastTimeTrackingFlush]: [
      literal(archiveState.lastTimeTrackingFlush),
    ],
    [SP_ARCHIVE_STATE.updated]: [literal(archiveState.updated)],
    [SP_ARCHIVE_STATE.timeTracking]: [jsonLiteral(archiveState.timeTracking)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/archive/state/${archiveState.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/archive/state/${archiveState.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/archive/state/${archiveState.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityArchiveState'],
    facets: {
      title: `Archive ${archiveState.bucket}`,
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
