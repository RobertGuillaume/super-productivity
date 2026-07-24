import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { SP_PROJECT } from './solid-productivity-vocab';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidProjectRepository', () => {
  const project: Project = {
    ...DEFAULT_PROJECT,
    id: 'project-1',
    title: 'Project through a write plan',
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
          projects: 'https://pod.example/super-productivity/projects/',
        },
        types: {
          SuperProductivityProject: {
            name: 'Project',
            type: 'SuperProductivityProject',
            target: {
              containerUri: 'https://pod.example/super-productivity/projects/',
            },
          },
        },
      }),
      projectProfile: {
        name: 'Project',
        type: 'SuperProductivityProject',
        target: {
          containerUri: 'https://pod.example/super-productivity/projects/',
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

  it('commits existing project updates through the runtime write plan API', async () => {
    const existingThing = createThing(project.title);
    const updatedThing = createThing('Updated project title');
    const plan = {
      id: 'write-plan-1',
      kind: 'thing.update',
      request: {
        kind: 'thing.update',
        uri: existingThing.uri,
        changes: {},
      },
      operations: [],
      affectedResources: [],
      diagnostics: [],
    } as RuntimeWritePlan;

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const saved = await TestBed.inject(SolidProjectRepository).saveProject(project);

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated project title');
  });
});

const createThing = (title: string): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_PROJECT.id]: [literal('project-1')],
    [SP_PROJECT.title]: [literal(title)],
    [SP_PROJECT.isArchived]: [literal(false)],
    [SP_PROJECT.isDone]: [literal(false)],
    [SP_PROJECT.isHiddenFromMenu]: [literal(false)],
    [SP_PROJECT.isEnableBacklog]: [literal(false)],
    [SP_PROJECT.taskId]: [literal('task-1')],
    [SP_PROJECT.backlogTaskId]: [],
    [SP_PROJECT.noteId]: [],
    [SP_PROJECT.theme]: [literal(JSON.stringify(DEFAULT_PROJECT.theme))],
    [SP_PROJECT.advancedCfg]: [literal(JSON.stringify(DEFAULT_PROJECT.advancedCfg))],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/projects/project-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/projects/project-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/projects/project-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityProject'],
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
