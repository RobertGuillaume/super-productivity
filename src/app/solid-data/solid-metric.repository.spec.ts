import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { Metric } from '../features/metric/metric.model';
import { RDF_JSON_DATATYPE, SP_METRIC } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidMetricRepository } from './solid-metric.repository';
import {
  activateSolidMutationTestBinding,
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidMetricRepository', () => {
  const metric: Metric = {
    id: '2026-08-04',
    focusSessions: [25],
    notes: 'Solid metric',
    remindTomorrow: true,
    reflections: [
      {
        text: 'Good rhythm',
        created: 1710000000000,
      },
    ],
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
          metrics: 'https://pod.example/super-productivity/metrics/',
        },
        types: {
          SuperProductivityMetric: {
            name: 'Metric',
            type: 'SuperProductivityMetric',
            target: {
              containerUri: 'https://pod.example/super-productivity/metrics/',
            },
          },
        },
      }),
      metricProfile: {
        name: 'Metric',
        type: 'SuperProductivityMetric',
        target: {
          containerUri: 'https://pod.example/super-productivity/metrics/',
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

  beforeEach(() => activateSolidMutationTestBinding());

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads metrics from the configured Solid container', async () => {
    things.query.and.resolveTo({ things: [createThing(metric)] });

    const metrics = await TestBed.inject(SolidMetricRepository).loadMetrics();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityMetric',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/metrics/',
        },
      }),
    );
    expect(metrics.value).toEqual([metric]);
  });

  it('creates deterministic metric resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(metric));

    await TestBed.inject(SolidMetricRepository).saveMetric(metric);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/metrics/',
          resourceName: '2026-08-04',
        },
        properties: jasmine.objectContaining({
          [SP_METRIC.id]: ['2026-08-04'],
          [SP_METRIC.notes]: ['Solid metric'],
        }),
      }),
    );
  });

  it('commits existing metric updates through the runtime write plan API', async () => {
    const existingThing = createThing(metric);
    const updatedThing = createThing({
      ...metric,
      notes: 'Updated notes',
    });
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidMetricRepository);
    await repository.loadMetrics();
    const saved = await repository.saveMetric(metric);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        fields: jasmine.objectContaining({
          id: metric.id,
          notes: metric.notes,
          remindTomorrow: metric.remindTomorrow,
        }),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.notes).toBe('Updated notes');
  });

  it('deletes existing metric resources through the runtime delete API', async () => {
    const existingThing = createThing(metric);
    things.query.and.resolveTo({ things: [existingThing] });
    things.delete.and.resolveTo();

    await TestBed.inject(SolidMetricRepository).deleteMetric(metric.id);

    expect(things.delete).toHaveBeenCalledOnceWith(existingThing.uri);
  });
});

const createThing = (metric: Metric): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_METRIC.id]: [literal(metric.id)],
    [SP_METRIC.notes]: [literal(metric.notes as string)],
    [SP_METRIC.remindTomorrow]: [literal(metric.remindTomorrow as boolean)],
    [SP_METRIC.focusSessions]: [jsonLiteral(metric.focusSessions)],
    [SP_METRIC.reflections]: [jsonLiteral(metric.reflections)],
    [SP_METRIC.metricData]: [jsonLiteral(metric)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/metrics/${metric.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/metrics/${metric.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/metrics/${metric.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityMetric'],
    facets: {
      title: `Metric ${metric.id}`,
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
