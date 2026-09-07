import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_GLOBAL_CONFIG } from '../features/config/default-global-config.const';
import { GlobalConfigState } from '../features/config/global-config.model';
import { RDF_JSON_DATATYPE, SP_GLOBAL_CONFIG } from './solid-productivity-vocab';
import { SOLID_GLOBAL_CONFIG_ID, SolidGlobalConfig } from './solid-global-config.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';

describe('SolidGlobalConfigRepository', () => {
  const globalConfig: GlobalConfigState = {
    ...DEFAULT_GLOBAL_CONFIG,
    misc: {
      ...DEFAULT_GLOBAL_CONFIG.misc,
      isDisableAnimations: true,
    },
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
          config: 'https://pod.example/super-productivity/config/',
        },
        types: {
          SuperProductivityGlobalConfig: {
            name: 'Global config',
            type: 'SuperProductivityGlobalConfig',
            target: {
              containerUri: 'https://pod.example/super-productivity/config/',
            },
          },
        },
      }),
      globalConfigProfile: {
        name: 'Global config',
        type: 'SuperProductivityGlobalConfig',
        target: {
          containerUri: 'https://pod.example/super-productivity/config/',
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

  it('loads global config from the configured Solid container', async () => {
    things.query.and.resolveTo({ things: [createThing({ config: globalConfig })] });

    const loaded = await TestBed.inject(SolidGlobalConfigRepository).loadGlobalConfig();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityGlobalConfig',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/config/',
        },
      }),
    );
    expect(loaded.value?.misc.isDisableAnimations).toBe(true);
  });

  it('creates deterministic global config resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing({ config: globalConfig }));

    await TestBed.inject(SolidGlobalConfigRepository).saveGlobalConfig(globalConfig);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/config/',
          resourceName: SOLID_GLOBAL_CONFIG_ID,
        },
        properties: jasmine.objectContaining({
          [SP_GLOBAL_CONFIG.id]: [SOLID_GLOBAL_CONFIG_ID],
        }),
      }),
    );
  });

  it('commits existing global config updates through the runtime write plan API', async () => {
    const existingThing = createThing({ config: globalConfig });
    const updatedConfig: GlobalConfigState = {
      ...globalConfig,
      misc: {
        ...globalConfig.misc,
        isDisableAnimations: false,
      },
    };
    const updatedThing = createThing({ config: updatedConfig });
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

    const saved = await TestBed.inject(SolidGlobalConfigRepository).saveGlobalConfig(
      globalConfig,
    );

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.misc.isDisableAnimations).toBe(false);
  });
});

const createThing = (
  input: Partial<SolidGlobalConfig> & { config: GlobalConfigState },
): Thing => {
  const updated = input.updated ?? 1710000000000;
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_GLOBAL_CONFIG.id]: [literal(SOLID_GLOBAL_CONFIG_ID)],
    [SP_GLOBAL_CONFIG.updated]: [literal(updated)],
    [SP_GLOBAL_CONFIG.configData]: [jsonLiteral(input.config)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/config/${SOLID_GLOBAL_CONFIG_ID}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/config/${SOLID_GLOBAL_CONFIG_ID}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/config/${SOLID_GLOBAL_CONFIG_ID}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityGlobalConfig'],
    facets: {
      title: 'Global config',
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
