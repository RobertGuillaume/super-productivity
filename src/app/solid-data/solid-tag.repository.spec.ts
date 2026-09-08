import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { SP_TAG } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTagRepository } from './solid-tag.repository';

describe('SolidTagRepository', () => {
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Tag through a write plan',
    created: 1710000000000,
    taskIds: ['task-1'],
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
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          tags: 'https://pod.example/super-productivity/tags/',
        },
        types: {
          SuperProductivityTag: {
            name: 'Tag',
            type: 'SuperProductivityTag',
            target: {
              containerUri: 'https://pod.example/super-productivity/tags/',
            },
          },
        },
      }),
      tagProfile: {
        name: 'Tag',
        type: 'SuperProductivityTag',
        target: {
          containerUri: 'https://pod.example/super-productivity/tags/',
        },
      },
      client: {
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

  it('commits existing tag updates through the runtime write plan API', async () => {
    const existingThing = createThing(tag.title);
    const updatedThing = createThing('Updated tag title');
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

    const repository = TestBed.inject(SolidTagRepository);
    await repository.loadTags();
    const saved = await repository.saveTag(tag);

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated tag title');
  });
});

const createThing = (title: string): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_TAG.id]: [literal('tag-1')],
    [SP_TAG.title]: [literal(title)],
    [SP_TAG.created]: [literal(1710000000000)],
    [SP_TAG.taskId]: [literal('task-1')],
    [SP_TAG.theme]: [literal(JSON.stringify(DEFAULT_TAG.theme))],
    [SP_TAG.advancedCfg]: [literal(JSON.stringify(DEFAULT_TAG.advancedCfg))],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/tags/tag-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/tags/tag-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/tags/tag-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTag'],
    facets: {
      title,
      status: 'open',
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
