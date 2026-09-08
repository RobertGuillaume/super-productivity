import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { Section } from '../features/section/section.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { SP_SECTION } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSectionRepository } from './solid-section.repository';

describe('SolidSectionRepository', () => {
  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Section through a write plan',
    isExpanded: true,
    taskIds: ['task-1'],
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
          sections: 'https://pod.example/super-productivity/sections/',
        },
        types: {
          SuperProductivitySection: {
            name: 'Section',
            type: 'SuperProductivitySection',
            target: {
              containerUri: 'https://pod.example/super-productivity/sections/',
            },
          },
        },
      }),
      sectionProfile: {
        name: 'Section',
        type: 'SuperProductivitySection',
        target: {
          containerUri: 'https://pod.example/super-productivity/sections/',
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

  it('loads sections from the configured Solid container', async () => {
    things.query.and.resolveTo({ things: [createThing(section.title)] });

    const sections = await TestBed.inject(SolidSectionRepository).loadSections();

    expect(discovery.start).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivitySection',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/sections/',
        },
      }),
    );
    expect(sections.value[0]).toEqual(section);
  });

  it('creates deterministic section resources when no section exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(section.title));

    await TestBed.inject(SolidSectionRepository).saveSection(section);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/sections/',
          resourceName: 'section-1',
        },
        properties: jasmine.objectContaining({
          [SP_SECTION.id]: ['section-1'],
          [SP_SECTION.taskId]: ['task-1'],
        }),
      }),
    );
  });

  it('commits existing section updates through the runtime write plan API', async () => {
    const existingThing = createThing(section.title);
    const updatedThing = createThing('Updated section title');
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

    const repository = TestBed.inject(SolidSectionRepository);
    await repository.loadSections();
    const saved = await repository.saveSection(section);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated section title');
  });
});

const createThing = (title: string): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_SECTION.id]: [literal('section-1')],
    [SP_SECTION.contextId]: [literal('project-1')],
    [SP_SECTION.contextType]: [literal(WorkContextType.PROJECT)],
    [SP_SECTION.title]: [literal(title)],
    [SP_SECTION.isExpanded]: [literal(true)],
    [SP_SECTION.taskId]: [literal('task-1')],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/sections/section-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/sections/section-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/sections/section-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivitySection'],
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
