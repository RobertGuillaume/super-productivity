import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { RuntimeError, SolidGraphRuntime } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import {
  ICAL_TASK,
  ICAL_VTODO_CLASS,
  SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SP_TASK,
} from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SOLID_SEMANTIC_PROFILES } from './solid-semantic-profiles';
import {
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskRepository', () => {
  const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const runtimeType = 'https://schema.org/additionalType';
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Update me through a write plan',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
  };

  let things: {
    query: jasmine.Spy;
    get: jasmine.Spy;
    create: jasmine.Spy;
    delete: jasmine.Spy;
    subscribe: jasmine.Spy;
  };
  let discovery: {
    discoverType: jasmine.Spy;
    refresh: jasmine.Spy;
  };
  let writes: {
    planUpdate: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    things = jasmine.createSpyObj('things', [
      'query',
      'get',
      'create',
      'delete',
      'subscribe',
    ]);
    discovery = jasmine.createSpyObj('discovery', ['discoverType', 'refresh']);
    discovery.discoverType.and.resolveTo(undefined);
    discovery.refresh.and.resolveTo(undefined);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);
    installRuntimeWritePlanBridge(writes, things);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          tasks: 'https://pod.example/super-productivity/tasks/',
        },
        types: {
          Task: {
            name: 'Task',
            type: 'Task',
            target: {
              containerUri: 'https://pod.example/super-productivity/tasks/',
            },
          },
        },
      }),
      taskProfile: {
        name: 'Task',
        type: 'Task',
        target: {
          containerUri: 'https://pod.example/super-productivity/tasks/',
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

  it('reads Pod-wide tasks from the catalog without starting discovery', async () => {
    const externalThing = createThing('Task from another Pod container', {
      uri: 'https://pod.example/calendar/work.ttl#todo-1',
      properties: {
        [ICAL_TASK.summary]: [literal('Task from another Pod container')],
      },
      types: [SOLID_PRODUCTIVITY_TASK_TYPE],
    });
    things.query.and.resolveTo({ things: [externalThing] });

    const loaded = await TestBed.inject(SolidTaskRepository).loadTasks();

    expect(discovery.discoverType).not.toHaveBeenCalled();
    expect(discovery.refresh).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledOnceWith(
      {
        type: [SOLID_PRODUCTIVITY_TASK_TYPE, SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE],
      },
      {
        scope: { kind: 'runtime-graph' },
        autoDiscover: false,
      },
    );
    expect(loaded.value[0].id).toBe(externalThing.uri);
    expect(loaded.value[0].title).toBe('Task from another Pod container');
  });

  it('keeps legacy Super Productivity task resources in Pod-wide results', async () => {
    const legacyThing = createThing('Legacy task', {
      uri: 'https://pod.example/archive/legacy-task.ttl#it',
      types: [SOLID_PRODUCTIVITY_LEGACY_TASK_TYPE],
    });
    things.query.and.resolveTo({ things: [legacyThing] });

    const loaded = await TestBed.inject(SolidTaskRepository).loadTasks();

    expect(loaded.value).toHaveSize(1);
    expect(loaded.value[0].id).toBe(task.id);
    expect(loaded.value[0].title).toBe('Legacy task');
  });

  it('projects more than 250 catalog tasks without application batching', async () => {
    const catalogThings = Array.from({ length: 251 }, (_, index) => {
      const id = `task-${index}`;
      return createThing(`Task ${index}`, {
        uri: `https://pod.example/super-productivity/tasks/${id}.ttl#it`,
        properties: { [SP_TASK.id]: [literal(id)] },
      });
    });
    things.query.and.resolveTo({ things: catalogThings });

    const loaded = await TestBed.inject(SolidTaskRepository).loadTasks();

    expect(loaded.value).toHaveSize(251);
    expect(loaded.value[250].id).toBe('task-250');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('commits existing task updates through the runtime write plan API', async () => {
    const existingThing = createThing(task.title);
    const updatedThing = createThing('Updated title');
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidTaskRepository);
    await repository.loadTasks();
    const saved = await repository.saveTask(task);

    expect(things.query).toHaveBeenCalledTimes(1);
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

  it('updates a newly created task by its returned Thing URI when the catalog lags', async () => {
    const createdThing = createThing(task.title);
    const completedThing = createThing(task.title, {
      properties: {
        ...createdThing.properties,
        [SP_TASK.isDone]: [literal(true)],
        [ICAL_TASK.status]: [literal('COMPLETED')],
      },
    });
    const plan = updateThingPlan(createdThing.uri, {});
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createdThing);
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: completedThing,
    });
    const repository = TestBed.inject(SolidTaskRepository);

    await repository.saveTask(task);
    await repository.saveTask({ ...task, isDone: true });

    expect(things.create).toHaveBeenCalledTimes(1);
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      createdThing.uri,
      jasmine.any(Object),
    );
  });

  it('updates the deterministic app Thing URI without treating an incomplete query as absence', async () => {
    const updatedThing = createThing('Updated without a lookup');
    const plan = updateThingPlan(updatedThing.uri, {});
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    await TestBed.inject(SolidTaskRepository).updateTask(task);

    expect(things.query).not.toHaveBeenCalled();
    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      'https://pod.example/super-productivity/tasks/task-1.ttl#it',
      jasmine.any(Object),
    );
  });

  it('refreshes a same-ID create conflict and keeps the existing Pod Thing', async () => {
    const existingThing = createThing('Existing Pod task');
    things.create.and.rejectWith(
      new RuntimeError('already exists', {
        code: 'resource-already-exists',
        details: {
          uri: existingThing.source.uri,
          status: 'available',
          httpStatus: 200,
        },
      }),
    );
    things.query.and.resolveTo({ things: [existingThing] });
    things.get.and.resolveTo(existingThing);

    const result = await TestBed.inject(SolidTaskRepository).createTask(task);

    expect(discovery.refresh).toHaveBeenCalledOnceWith({
      uris: [existingThing.source.uri],
    });
    expect(things.create).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('Existing Pod task');
  });

  it('serializes an update that arrives while task creation is still pending', async () => {
    const createdThing = createThing(task.title);
    const completedThing = createThing(task.title, {
      properties: {
        ...createdThing.properties,
        [SP_TASK.isDone]: [literal(true)],
      },
    });
    const plan = updateThingPlan(createdThing.uri, {});
    let signalCreateStarted: (() => void) | undefined;
    const createStarted = new Promise<void>((resolve) => {
      signalCreateStarted = resolve;
    });
    let releaseCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    things.query.and.resolveTo({ things: [] });
    things.create.and.callFake(async () => {
      signalCreateStarted?.();
      await createGate;
      return createdThing;
    });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: completedThing,
    });
    const repository = TestBed.inject(SolidTaskRepository);

    const create = repository.saveTask(task);
    await createStarted;
    const complete = repository.saveTask({ ...task, isDone: true });
    releaseCreate?.();
    await Promise.all([create, complete]);

    expect(things.create).toHaveBeenCalledTimes(1);
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      createdThing.uri,
      jasmine.any(Object),
    );
  });

  it('updates a discovered task at its original Pod URI', async () => {
    const externalUri = 'https://pod.example/calendar/work.ttl#todo-1';
    const externalThing = createThing('External task', {
      uri: externalUri,
      properties: {
        [ICAL_TASK.summary]: [literal('External task')],
      },
      types: ['Task'],
    });
    const plan = updateThingPlan(externalUri, {});
    things.query.and.resolveTo({ things: [externalThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: externalThing,
    });

    const repository = TestBed.inject(SolidTaskRepository);
    await repository.loadTasks();
    await repository.saveTask({
      ...task,
      id: externalUri,
    });

    expect(things.get).not.toHaveBeenCalled();
    expect(things.query).toHaveBeenCalledTimes(1);
    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(externalUri, jasmine.any(Object));
  });

  it('persists completion to the same Thing through the real runtime', async () => {
    const { repository, runtime } = await createRuntimeRepository();

    await repository.saveTask(task);
    const createdThings = await runtime.things.query(
      { type: 'Task' },
      { autoDiscover: false },
    );
    const createdThing = createdThings.things[0];
    expect(createdThing).toBeDefined();
    expect(createdThing.objects(rdfType)).toContain(ICAL_VTODO_CLASS);
    expect(createdThing.property(runtimeType)[0]).toEqual(
      jasmine.objectContaining({ value: SOLID_PRODUCTIVITY_TASK_TYPE }),
    );
    await repository.saveTask({
      ...task,
      isDone: true,
      doneOn: 1710000005000,
      modified: 1710000005000,
    });
    const reloaded = await runtime.things.get(createdThing.uri);

    expect(literalValues(reloaded?.property(SP_TASK.isDone))).toEqual([true]);
    expect(literalValues(reloaded?.property(ICAL_TASK.status))).toEqual(['COMPLETED']);
    expect(reloaded?.facets.status).toBe('done');
  });

  it('does not lose completion when create and update overlap', async () => {
    const { repository, runtime } = await createRuntimeRepository();
    const completedTask: Task = {
      ...task,
      isDone: true,
      doneOn: 1710000005000,
      modified: 1710000005000,
    };

    await Promise.all([repository.saveTask(task), repository.saveTask(completedTask)]);
    const result = await runtime.things.query({ type: 'Task' }, { autoDiscover: false });

    expect(result.things).toHaveSize(1);
    expect(literalValues(result.things[0].property(SP_TASK.isDone))).toEqual([true]);
    expect(literalValues(result.things[0].property(ICAL_TASK.status))).toEqual([
      'COMPLETED',
    ]);
  });
});

const createRuntimeRepository = async (): Promise<{
  repository: SolidTaskRepository;
  runtime: SolidGraphRuntime;
}> => {
  const runtime = new SolidGraphRuntime();
  await runtime.boot();
  installCompoundPatchSupport(runtime);
  const layout = runtime.layouts.define({
    namespace: 'https://super-productivity.com/ns#',
    containers: {
      tasks: 'super-productivity/tasks',
    },
    types: {
      Task: {
        classUri: 'http://www.w3.org/2002/12/cal/ical#Vtodo',
        container: 'tasks',
        defaultStatus: 'open',
      },
    },
  });
  for (const profile of SOLID_SEMANTIC_PROFILES) {
    runtime.types.register(profile);
  }
  TestBed.overrideProvider(SolidRuntimeService, {
    useValue: {
      client: runtime,
      taskProfile: layout.types.Task,
    },
  });

  return {
    repository: TestBed.inject(SolidTaskRepository),
    runtime,
  };
};

/** The commit-qualified runtime's browser mock applies only the first INSERT DATA
 * clause. Real Solid servers execute the complete SPARQL update, so make the
 * in-memory transport exercise every reviewed clause for this consumer test. */
const installCompoundPatchSupport = (runtime: SolidGraphRuntime): void => {
  const runtimeTransport = runtime as unknown as { customFetch: typeof fetch };
  const mockFetch = runtimeTransport.customFetch;
  runtimeTransport.customFetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const body = init?.body;
    if (
      init?.method !== 'PATCH' ||
      headers.get('Content-Type') !== 'application/sparql-update' ||
      typeof body !== 'string' ||
      !body.includes(' ;\n')
    ) {
      return mockFetch(input, init);
    }

    let response: Response | undefined;
    for (const [index, operation] of body.split(' ;\n').entries()) {
      const operationHeaders = new Headers(headers);
      if (index > 0) {
        operationHeaders.delete('If-Match');
        operationHeaders.delete('If-Unmodified-Since');
      }
      response = await mockFetch(input, {
        ...init,
        body: operation,
        headers: operationHeaders,
      });
      if (!response.ok) {
        return response;
      }
    }
    return response ?? mockFetch(input, init);
  };
};

const createThing = (
  title: string,
  overrides: {
    uri?: string;
    properties?: Readonly<Record<string, readonly RdfValue[]>>;
    types?: readonly string[];
  } = {},
): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> =
    overrides.properties ?? {
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
    uri: overrides.uri ?? 'https://pod.example/super-productivity/tasks/task-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/tasks/task-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/tasks/task-1.ttl',
      kind: 'runtime-managed',
    },
    types: overrides.types ?? ['Task'],
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

const literalValues = (
  values: readonly RdfValue[] | undefined,
): RdfLiteralValue['value'][] =>
  (values ?? [])
    .filter((value): value is RdfLiteralValue => value.kind === 'literal')
    .map((value) => value.value);
