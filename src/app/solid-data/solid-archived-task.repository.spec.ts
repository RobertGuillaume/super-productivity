import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SP_ARCHIVED_TASK } from './solid-productivity-vocab';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidArchivedTaskRepository', () => {
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Archived task',
    projectId: 'project-1',
    isDone: true,
    created: 1710000000000,
    doneOn: 1710000000100,
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
  let discovery: {
    start: jasmine.Spy;
  };

  beforeEach(() => {
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);
    discovery = jasmine.createSpyObj('discovery', ['start']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          archivedTasks: 'https://pod.example/super-productivity/archive/tasks/',
        },
        types: {
          SuperProductivityArchivedTask: {
            name: 'Archived task',
            type: 'SuperProductivityArchivedTask',
            target: {
              containerUri: 'https://pod.example/super-productivity/archive/tasks/',
            },
          },
        },
      }),
      archivedTaskProfile: {
        name: 'Archived task',
        type: 'SuperProductivityArchivedTask',
        target: {
          containerUri: 'https://pod.example/super-productivity/archive/tasks/',
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

  it('loads archived task resources from the archive container', async () => {
    things.query.and.resolveTo({ things: [createThing(task.title, 'old')] });

    const archivedTasks = await TestBed.inject(
      SolidArchivedTaskRepository,
    ).loadArchivedTasks();

    expect(discovery.start).toHaveBeenCalledOnceWith({
      entrypoints: ['https://pod.example/super-productivity/archive/tasks/'],
      mode: 'balanced',
    });
    expect(things.query).toHaveBeenCalledOnceWith(
      { type: 'SuperProductivityArchivedTask' },
      {
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/archive/tasks/',
        },
        autoDiscover: true,
      },
    );
    expect(archivedTasks[0].bucket).toBe('old');
    expect(archivedTasks[0].task.id).toBe(task.id);
    expect(archivedTasks[0].task.title).toBe(task.title);
    expect(archivedTasks[0].task.projectId).toBe(task.projectId);
  });

  it('creates missing archived task resources with deterministic names', async () => {
    const createdThing = createThing(task.title, 'young');
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createdThing);

    await TestBed.inject(SolidArchivedTaskRepository).saveArchivedTask(task, 'young');

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/archive/tasks/',
          resourceName: 'young-task-1',
        },
      }),
    );
  });

  it('commits existing archived task updates through the runtime write plan API', async () => {
    const existingThing = createThing(task.title, 'young');
    const updatedThing = createThing('Updated archive title', 'young');
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

    const saved = await TestBed.inject(SolidArchivedTaskRepository).saveArchivedTask(
      task,
      'young',
    );

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
        deleteProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated archive title');
  });

  it('deletes every archived resource for a task id', async () => {
    const youngThing = createThing(task.title, 'young');
    const oldThing = createThing(task.title, 'old');
    things.query.and.resolveTo({ things: [youngThing, oldThing] });
    things.delete.and.resolveTo(undefined);

    await TestBed.inject(SolidArchivedTaskRepository).deleteArchivedTask(task.id);

    expect(things.delete.calls.allArgs()).toEqual([[youngThing.uri], [oldThing.uri]]);
  });

  it('replaces archived task resources by bucket and deletes stale archive entries', async () => {
    const oldTask: Task = {
      ...task,
      title: 'Moved to old archive',
    };
    const existingYoungThing = createThing(task.title, 'young');
    const staleThing = createThing('Stale task', 'young', {
      ...task,
      id: 'task-2',
      title: 'Stale task',
    });
    const createdOldThing = createThing(oldTask.title, 'old', oldTask);

    things.query.and.callFake((query: { where?: readonly unknown[] }) =>
      Promise.resolve({
        things: query.where === undefined ? [existingYoungThing, staleThing] : [],
      }),
    );
    things.create.and.resolveTo(createdOldThing);
    things.delete.and.resolveTo(undefined);

    await TestBed.inject(SolidArchivedTaskRepository).replaceArchivedTasks([
      {
        task: oldTask,
        bucket: 'old',
      },
    ]);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: jasmine.objectContaining({
          resourceName: 'old-task-1',
        }),
      }),
    );
    expect(things.delete.calls.allArgs()).toEqual([
      [existingYoungThing.uri],
      [staleThing.uri],
    ]);
  });
});

const createThing = (
  title: string,
  bucket: 'young' | 'old',
  taskInput: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title,
    projectId: 'project-1',
    isDone: true,
    created: 1710000000000,
    doneOn: 1710000000100,
  },
): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_ARCHIVED_TASK.id]: [literal(taskInput.id)],
    [SP_ARCHIVED_TASK.bucket]: [literal(bucket)],
    [SP_ARCHIVED_TASK.projectId]: [literal(taskInput.projectId)],
    [SP_ARCHIVED_TASK.doneOn]: [literal(taskInput.doneOn ?? 0)],
    [SP_ARCHIVED_TASK.taskData]: [
      literal(
        JSON.stringify({
          ...taskInput,
          title,
        }),
      ),
    ],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/archive/tasks/${bucket}-${taskInput.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/archive/tasks/${bucket}-${taskInput.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/archive/tasks/${bucket}-${taskInput.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityArchivedTask'],
    facets: {
      title,
      status: 'archived',
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
