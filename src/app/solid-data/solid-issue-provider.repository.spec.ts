import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { IssueProvider } from '../features/issue/issue.model';
import { RDF_JSON_DATATYPE, SP_ISSUE_PROVIDER } from './solid-productivity-vocab';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  activateSolidMutationTestBinding,
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidIssueProviderRepository', () => {
  const issueProvider: IssueProvider = {
    id: 'issue-provider-1',
    issueProviderKey: 'GITHUB',
    isEnabled: true,
    pluginId: 'github-issue-provider',
    pluginConfig: {
      repo: 'owner/repo',
      token: 'secret',
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
    installRuntimeWritePlanBridge(writes, things);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          issueProviders: 'https://pod.example/super-productivity/issue-providers/',
        },
        types: {
          SuperProductivityIssueProvider: {
            name: 'Issue provider',
            type: 'SuperProductivityIssueProvider',
            target: {
              containerUri: 'https://pod.example/super-productivity/issue-providers/',
            },
          },
        },
      }),
      issueProviderProfile: {
        name: 'Issue provider',
        type: 'SuperProductivityIssueProvider',
        target: {
          containerUri: 'https://pod.example/super-productivity/issue-providers/',
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

  it('loads issue providers from the configured Solid container in order', async () => {
    things.query.and.resolveTo({
      things: [
        createThing({ ...issueProvider, id: 'b' }, 1),
        createThing(issueProvider, 0),
      ],
    });

    const issueProviders = await TestBed.inject(
      SolidIssueProviderRepository,
    ).loadIssueProviders();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityIssueProvider',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/issue-providers/',
        },
      }),
    );
    expect(issueProviders.value.map((provider) => provider.id)).toEqual([
      'issue-provider-1',
      'b',
    ]);
  });

  it('creates deterministic issue provider resources when no provider exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(issueProvider, 0));

    await TestBed.inject(SolidIssueProviderRepository).saveIssueProvider(
      issueProvider,
      5,
    );

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/issue-providers/',
          resourceName: 'issue-provider-1',
        },
        properties: jasmine.objectContaining({
          [SP_ISSUE_PROVIDER.id]: ['issue-provider-1'],
          [SP_ISSUE_PROVIDER.order]: [5],
        }),
      }),
    );
  });

  it('commits existing issue provider updates through the runtime write plan API', async () => {
    const existingThing = createThing(issueProvider, 0);
    const updatedThing = createThing({ ...issueProvider, isEnabled: false }, 0);
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidIssueProviderRepository);
    await repository.loadIssueProviders();
    const saved = await repository.saveIssueProvider(issueProvider);

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.isEnabled).toBe(false);
  });

  it('deletes an existing issue provider through the runtime delete API', async () => {
    const existingThing = createThing(issueProvider, 0);
    things.query.and.resolveTo({ things: [existingThing] });

    await TestBed.inject(SolidIssueProviderRepository).deleteIssueProvider(
      issueProvider.id,
    );

    expect(things.delete).toHaveBeenCalledOnceWith(existingThing.uri);
  });
});

const createThing = (issueProvider: IssueProvider, order: number): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_ISSUE_PROVIDER.id]: [literal(issueProvider.id)],
    [SP_ISSUE_PROVIDER.issueProviderKey]: [literal(issueProvider.issueProviderKey)],
    [SP_ISSUE_PROVIDER.isEnabled]: [literal(issueProvider.isEnabled)],
    [SP_ISSUE_PROVIDER.order]: [literal(order)],
    [SP_ISSUE_PROVIDER.providerData]: [jsonLiteral(issueProvider)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/issue-providers/${issueProvider.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/issue-providers/${issueProvider.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/issue-providers/${issueProvider.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityIssueProvider'],
    facets: {
      title: `${issueProvider.issueProviderKey} issue provider`,
      status: issueProvider.isEnabled ? 'active' : 'disabled',
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
