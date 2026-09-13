import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { MenuTreeKind, MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import { RDF_JSON_DATATYPE, SP_MENU_TREE } from './solid-productivity-vocab';
import { SOLID_MENU_TREE_ID, SolidMenuTree } from './solid-menu-tree.mapper';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidMenuTreeRepository', () => {
  const menuTree: MenuTreeState = {
    projectTree: [
      {
        id: 'folder-1',
        k: MenuTreeKind.FOLDER,
        name: 'Work',
        isExpanded: true,
        children: [
          {
            id: 'project-1',
            k: MenuTreeKind.PROJECT,
          },
        ],
      },
    ],
    tagTree: [
      {
        id: 'tag-1',
        k: MenuTreeKind.TAG,
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
          menuTree: 'https://pod.example/super-productivity/menu-tree/',
        },
        types: {
          SuperProductivityMenuTree: {
            name: 'Menu tree',
            type: 'SuperProductivityMenuTree',
            target: {
              containerUri: 'https://pod.example/super-productivity/menu-tree/',
            },
          },
        },
      }),
      menuTreeProfile: {
        name: 'Menu tree',
        type: 'SuperProductivityMenuTree',
        target: {
          containerUri: 'https://pod.example/super-productivity/menu-tree/',
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

  it('loads menu tree from the configured Solid container', async () => {
    things.query.and.resolveTo({ things: [createThing({ menuTree })] });

    const loaded = await TestBed.inject(SolidMenuTreeRepository).loadMenuTree();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityMenuTree',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/menu-tree/',
        },
      }),
    );
    expect(loaded.value).toEqual(menuTree);
  });

  it('creates deterministic menu tree resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing({ menuTree }));

    await TestBed.inject(SolidMenuTreeRepository).saveMenuTree(menuTree);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/menu-tree/',
          resourceName: SOLID_MENU_TREE_ID,
        },
        properties: jasmine.objectContaining({
          [SP_MENU_TREE.id]: [SOLID_MENU_TREE_ID],
          [SP_MENU_TREE.projectTree]: [jasmine.any(Object)],
          [SP_MENU_TREE.tagTree]: [jasmine.any(Object)],
        }),
      }),
    );
  });

  it('commits existing menu tree updates through the runtime write plan API', async () => {
    const existingThing = createThing({ menuTree });
    const updatedMenuTree: MenuTreeState = {
      ...menuTree,
      tagTree: [
        ...menuTree.tagTree,
        {
          id: 'tag-2',
          k: MenuTreeKind.TAG,
        },
      ],
    };
    const updatedThing = createThing({ menuTree: updatedMenuTree });
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidMenuTreeRepository);
    await repository.loadMenuTree();
    const saved = await repository.saveMenuTree(menuTree);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.tagTree).toEqual(updatedMenuTree.tagTree);
  });
});

const createThing = (
  input: Partial<SolidMenuTree> & { menuTree: MenuTreeState },
): Thing => {
  const updated = input.updated ?? 1710000000000;
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_MENU_TREE.id]: [literal(SOLID_MENU_TREE_ID)],
    [SP_MENU_TREE.updated]: [literal(updated)],
    [SP_MENU_TREE.projectTree]: [jsonLiteral(input.menuTree.projectTree)],
    [SP_MENU_TREE.tagTree]: [jsonLiteral(input.menuTree.tagTree)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/menu-tree/${SOLID_MENU_TREE_ID}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/menu-tree/${SOLID_MENU_TREE_ID}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/menu-tree/${SOLID_MENU_TREE_ID}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityMenuTree'],
    facets: {
      title: 'Menu tree',
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
