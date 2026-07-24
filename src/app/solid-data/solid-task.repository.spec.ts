import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SP_TASK } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskRepository', () => {
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Update me through a write plan',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
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
          tasks: 'https://pod.example/super-productivity/tasks/',
        },
        types: {
          SuperProductivityTask: {
            name: 'Task',
            type: 'SuperProductivityTask',
            target: {
              containerUri: 'https://pod.example/super-productivity/tasks/',
            },
          },
        },
      }),
      taskProfile: {
        name: 'Task',
        type: 'SuperProductivityTask',
        target: {
          containerUri: 'https://pod.example/super-productivity/tasks/',
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

  it('commits existing task updates through the runtime write plan API', async () => {
    const existingThing = createThing(task.title);
    const updatedThing = createThing('Updated title');
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

    const saved = await TestBed.inject(SolidTaskRepository).saveTask(task);

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated title');
  });
});

const createThing = (title: string): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_TASK.id]: [literal('task-1')],
    [SP_TASK.projectId]: [literal(INBOX_PROJECT.id)],
    [SP_TASK.isDone]: [literal(false)],
    [SP_TASK.created]: [literal(1710000000000)],
    [SP_TASK.timeSpent]: [literal(0)],
    [SP_TASK.timeEstimate]: [literal(0)],
    [SP_TASK.attachments]: [literal('[]')],
    [SP_TASK.timeSpentOnDay]: [literal('{}')],
  };
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/tasks/task-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/tasks/task-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/tasks/task-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTask'],
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
