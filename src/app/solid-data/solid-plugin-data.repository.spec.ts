import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import {
  RDF_JSON_DATATYPE,
  SP_PLUGIN_METADATA,
  SP_PLUGIN_USER_DATA,
} from './solid-productivity-vocab';
import {
  pluginMetadataResourceName,
  pluginUserDataResourceName,
} from './solid-plugin-data.mapper';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  activateSolidMutationTestBinding,
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidPluginDataRepository', () => {
  const pluginUserData: PluginUserData = {
    id: 'plugin-a:doc-1',
    data: JSON.stringify({
      title: 'Doc',
    }),
  };
  const pluginMetadata: PluginMetadata = {
    id: 'plugin-a',
    isEnabled: true,
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
    installRuntimeWritePlanBridge(writes, things);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          pluginUserData: 'https://pod.example/super-productivity/plugins/user-data/',
          pluginMetadata: 'https://pod.example/super-productivity/plugins/metadata/',
        },
        types: {
          SuperProductivityPluginUserData: {
            name: 'Plugin user data',
            type: 'SuperProductivityPluginUserData',
            target: {
              containerUri: 'https://pod.example/super-productivity/plugins/user-data/',
            },
          },
          SuperProductivityPluginMetadata: {
            name: 'Plugin metadata',
            type: 'SuperProductivityPluginMetadata',
            target: {
              containerUri: 'https://pod.example/super-productivity/plugins/metadata/',
            },
          },
        },
      }),
      pluginUserDataProfile: {
        name: 'Plugin user data',
        type: 'SuperProductivityPluginUserData',
        target: {
          containerUri: 'https://pod.example/super-productivity/plugins/user-data/',
        },
      },
      pluginMetadataProfile: {
        name: 'Plugin metadata',
        type: 'SuperProductivityPluginMetadata',
        target: {
          containerUri: 'https://pod.example/super-productivity/plugins/metadata/',
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

  it('loads plugin user data resources from the configured Solid container', async () => {
    things.query.and.resolveTo({
      things: [createPluginUserDataThing(pluginUserData)],
    });

    const loaded = await TestBed.inject(SolidPluginDataRepository).loadPluginUserData();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityPluginUserData',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/plugins/user-data/',
        },
      }),
    );
    expect(loaded.value).toEqual([pluginUserData]);
  });

  it('loads plugin metadata resources from the configured Solid container', async () => {
    things.query.and.resolveTo({
      things: [createPluginMetadataThing(pluginMetadata)],
    });

    const loaded = await TestBed.inject(SolidPluginDataRepository).loadPluginMetadata();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(loaded.value).toEqual([pluginMetadata]);
  });

  it('creates deterministic plugin user data resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createPluginUserDataThing(pluginUserData));

    await TestBed.inject(SolidPluginDataRepository).savePluginUserData(pluginUserData);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/plugins/user-data/',
          resourceName: pluginUserDataResourceName(pluginUserData.id),
        },
        properties: jasmine.objectContaining({
          [SP_PLUGIN_USER_DATA.id]: [pluginUserData.id],
          [SP_PLUGIN_USER_DATA.data]: [pluginUserData.data],
          [SP_PLUGIN_USER_DATA.userData]: [jasmine.any(Object)],
        }),
      }),
    );
  });

  it('commits existing plugin user data updates through the runtime write plan API', async () => {
    const existingThing = createPluginUserDataThing(pluginUserData);
    const updatedThing = createPluginUserDataThing({
      ...pluginUserData,
      data: 'updated',
    });
    const plan = createPlan(existingThing);

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidPluginDataRepository);
    await repository.loadPluginUserData();
    const saved = await repository.savePluginUserData(pluginUserData);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.data).toBe('updated');
  });

  it('creates deterministic plugin metadata resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createPluginMetadataThing(pluginMetadata));

    await TestBed.inject(SolidPluginDataRepository).savePluginMetadata(pluginMetadata);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/plugins/metadata/',
          resourceName: pluginMetadataResourceName(pluginMetadata.id),
        },
        properties: jasmine.objectContaining({
          [SP_PLUGIN_METADATA.id]: [pluginMetadata.id],
          [SP_PLUGIN_METADATA.isEnabled]: [true],
          [SP_PLUGIN_METADATA.metadataData]: [jasmine.any(Object)],
        }),
      }),
    );
  });

  it('commits existing plugin metadata updates through the runtime write plan API', async () => {
    const existingThing = createPluginMetadataThing(pluginMetadata);
    const updatedThing = createPluginMetadataThing({
      ...pluginMetadata,
      isEnabled: false,
    });
    const plan = createPlan(existingThing);

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidPluginDataRepository);
    await repository.loadPluginMetadata();
    const saved = await repository.savePluginMetadata(pluginMetadata);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.isEnabled).toBe(false);
  });

  it('deletes plugin resources through the runtime delete API', async () => {
    const userDataThing = createPluginUserDataThing(pluginUserData);
    const metadataThing = createPluginMetadataThing(pluginMetadata);
    things.query.and.returnValues(
      Promise.resolve({ things: [userDataThing] }),
      Promise.resolve({ things: [metadataThing] }),
    );
    things.delete.and.resolveTo(undefined);

    await TestBed.inject(SolidPluginDataRepository).deletePluginUserData(
      pluginUserData.id,
    );
    await TestBed.inject(SolidPluginDataRepository).deletePluginMetadata(
      pluginMetadata.id,
    );

    expect(things.delete.calls.allArgs()).toEqual([
      [userDataThing.uri],
      [metadataThing.uri],
    ]);
  });
});

const createPlan = (thing: Thing): ReturnType<typeof updateThingPlan> =>
  updateThingPlan(thing.uri, {});

const createPluginUserDataThing = (pluginUserData: PluginUserData): Thing => {
  const resourceName = pluginUserDataResourceName(pluginUserData.id);
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_PLUGIN_USER_DATA.id]: [literal(pluginUserData.id)],
    [SP_PLUGIN_USER_DATA.data]: [literal(pluginUserData.data)],
    [SP_PLUGIN_USER_DATA.userData]: [jsonLiteral(pluginUserData)],
  };

  return createThing({
    uri: `https://pod.example/super-productivity/plugins/user-data/${resourceName}.ttl#it`,
    contentUri: `https://pod.example/super-productivity/plugins/user-data/${resourceName}.ttl`,
    types: ['SuperProductivityPluginUserData'],
    title: `Plugin user data ${pluginUserData.id}`,
    status: 'active',
    properties,
  });
};

const createPluginMetadataThing = (pluginMetadata: PluginMetadata): Thing => {
  const resourceName = pluginMetadataResourceName(pluginMetadata.id);
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_PLUGIN_METADATA.id]: [literal(pluginMetadata.id)],
    [SP_PLUGIN_METADATA.isEnabled]: [literal(pluginMetadata.isEnabled)],
    [SP_PLUGIN_METADATA.metadataData]: [jsonLiteral(pluginMetadata)],
  };

  return createThing({
    uri: `https://pod.example/super-productivity/plugins/metadata/${resourceName}.ttl#it`,
    contentUri: `https://pod.example/super-productivity/plugins/metadata/${resourceName}.ttl`,
    types: ['SuperProductivityPluginMetadata'],
    title: `Plugin metadata ${pluginMetadata.id}`,
    status: pluginMetadata.isEnabled ? 'active' : 'disabled',
    properties,
  });
};

const createThing = ({
  uri,
  contentUri,
  types,
  title,
  status,
  properties,
}: {
  uri: string;
  contentUri: string;
  types: string[];
  title: string;
  status: string;
  properties: Readonly<Record<string, readonly RdfValue[]>>;
}): Thing => {
  const thing: Thing = {
    uri,
    content: {
      uri: contentUri,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: contentUri,
      kind: 'runtime-managed',
    },
    types,
    facets: {
      title,
      status,
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
