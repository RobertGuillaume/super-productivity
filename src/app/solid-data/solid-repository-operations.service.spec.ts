import { TestBed } from '@angular/core/testing';
import type {
  CreateThingInput,
  SolidRuntime,
  Thing,
  ThingChanges,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  SolidRepositoryMutation,
  SolidRepositoryOperations,
} from './solid-repository-operations.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';
import {
  createThingPlan,
  deleteThingPlan,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';
import { SolidContainerProvisioningService } from './solid-container-provisioning.service';

describe('SolidRepositoryOperations', () => {
  const profile = {
    type: 'Task',
    name: 'Task',
    defaultStatus: 'open',
    target: { containerUri: 'https://pod.example/tasks/' },
  } as ThingWriteProfile;
  const createInput = {
    profile,
    target: { resourceName: 'task-1' },
    title: 'safe test value',
  } as CreateThingInput;
  const changes = { title: 'safe test value' } as ThingChanges;
  let runtime: SolidRuntime;
  let query: jasmine.Spy;
  let get: jasmine.Spy;
  let refresh: jasmine.Spy;
  let planCreate: jasmine.Spy;
  let planUpdate: jasmine.Spy;
  let planDelete: jasmine.Spy;
  let commit: jasmine.Spy;
  let ensureContainer: jasmine.Spy;

  beforeEach(() => {
    query = jasmine.createSpy('query');
    get = jasmine.createSpy('get');
    refresh = jasmine.createSpy('refresh').and.resolveTo();
    planCreate = jasmine.createSpy('planCreate');
    planUpdate = jasmine.createSpy('planUpdate');
    planDelete = jasmine.createSpy('planDelete');
    commit = jasmine.createSpy('commit');
    ensureContainer = jasmine.createSpy('ensure').and.resolveTo();
    runtime = {
      things: { query, get },
      discovery: { refresh },
      writes: { planCreate, planUpdate, planDelete, commit },
    } as unknown as SolidRuntime;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: { client: runtime },
        },
        {
          provide: SolidContainerProvisioningService,
          useValue: { ensure: ensureContainer },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('updates a remembered exact Thing without querying or creating', async () => {
    const identities = TestBed.inject(SolidThingIdentityRegistry);
    const existing = thing('https://pod.example/tasks/custom.ttl#todo');
    const updated = thing('https://pod.example/tasks/custom.ttl#todo');
    identities.remember('task', 'task-1', existing);
    planUpdate.and.resolveTo(updateThingPlan(existing.uri, changes));
    commit.and.resolveTo({ kind: 'thing.update', result: updated });

    await TestBed.inject(SolidRepositoryOperations).upsert(mutation());

    expect(planUpdate).toHaveBeenCalledOnceWith(
      existing.uri,
      jasmine.objectContaining({ fields: { title: 'safe test value' } }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('creates through a bound plan with canonical fields', async () => {
    const created = thing('https://pod.example/tasks/task-1.ttl#it');
    planCreate.and.resolveTo(
      createThingPlan(createInput, 'https://pod.example/tasks/task-1.ttl'),
    );
    commit.and.resolveTo({ kind: 'thing.create', result: created });

    const result = await TestBed.inject(SolidRepositoryOperations).create(mutation());

    expect(planCreate).toHaveBeenCalledTimes(1);
    expect(ensureContainer).toHaveBeenCalledOnceWith('https://pod.example/tasks/');
    const plannedInput = planCreate.calls.mostRecent().args[0] as CreateThingInput;
    expect(plannedInput.title).toBeUndefined();
    expect(plannedInput.fields).toEqual(
      jasmine.objectContaining({ title: 'safe test value' }),
    );
    expect(result).toBe('task-1');
  });

  it('serializes v4 identity, HTTP intent, and validators without runtime objects', () => {
    const plan = updateThingPlan('https://pod.example/tasks/task-1.ttl#it', changes);

    expect(JSON.parse(JSON.stringify(plan))).toEqual(
      jasmine.objectContaining({
        version: 4,
        identity: jasmine.objectContaining({
          principalWebId: 'https://pod.example/profile/card#me',
        }),
        http: [
          jasmine.objectContaining({
            method: 'PUT',
            destination: 'https://pod.example/tasks/task-1.ttl',
            headers: { ['If-Match']: '"test-etag"' },
          }),
        ],
        preconditions: [
          {
            kind: 'etag.matches',
            uri: 'https://pod.example/tasks/task-1.ttl',
            etag: '"test-etag"',
          },
        ],
      }),
    );
  });

  it('refreshes and accepts the Pod version after a deterministic create conflict', async () => {
    const podThing = thing('https://pod.example/tasks/task-1.ttl#it');
    planCreate.and.rejectWith({
      code: 'resource-already-exists',
      details: { uri: 'https://pod.example/tasks/task-1.ttl' },
    });
    get.and.resolveTo(podThing);

    const result = await TestBed.inject(SolidRepositoryOperations).create(mutation());

    expect(refresh).toHaveBeenCalledOnceWith({
      uris: ['https://pod.example/tasks/task-1.ttl'],
    });
    expect(get).toHaveBeenCalledOnceWith(podThing.uri);
    expect(result).toBe(podThing.uri);
  });

  it('confirms a partial create only after targeted catalog reconciliation', async () => {
    const podThing = thing('https://pod.example/tasks/task-1.ttl#it');
    planCreate.and.resolveTo(
      createThingPlan(createInput, 'https://pod.example/tasks/task-1.ttl'),
    );
    commit.and.rejectWith({
      outcomes: [
        {
          operationIndex: 0,
          operation: {
            kind: 'rdf.create',
            summary: 'create task',
            uri: 'https://pod.example/tasks/task-1.ttl',
            mediaType: 'text/turtle',
            bodySha256: 'test-body',
          },
          status: 'completed',
        },
        {
          operationIndex: 1,
          operation: {
            kind: 'type-index.register',
            summary: 'register task',
            runtimeType: 'Task',
          },
          status: 'failed',
          failure: { kind: 'reconciliation-failed', phase: 'body' },
        },
      ],
    });
    get.and.resolveTo(podThing);

    const result = await TestBed.inject(SolidRepositoryOperations).create(mutation());

    expect(refresh).toHaveBeenCalledOnceWith({
      uris: ['https://pod.example/tasks/task-1.ttl'],
    });
    expect(result).toBe(podThing.uri);
  });

  it('refreshes authoritative state after a validator conflict', async () => {
    const identities = TestBed.inject(SolidThingIdentityRegistry);
    const existing = thing('https://pod.example/tasks/shared.ttl#todo');
    const podThing = thing(existing.uri);
    identities.remember('task', 'task-1', existing);
    planUpdate.and.rejectWith({
      code: 'write-plan-conflict',
      details: {
        uri: existing.source.uri,
        failure: { kind: 'conflict', phase: 'headers', httpStatus: 412 },
      },
    });
    get.and.resolveTo(podThing);

    const result = await TestBed.inject(SolidRepositoryOperations).update(mutation());

    expect(refresh).toHaveBeenCalledOnceWith({ uris: [existing.source.uri] });
    expect(result).toBe(podThing.uri);
  });

  it('verifies a completed update when only post-commit reconciliation failed', async () => {
    const identities = TestBed.inject(SolidThingIdentityRegistry);
    const existing = thing('https://pod.example/tasks/shared.ttl#todo');
    const podThing = thing(existing.uri);
    identities.remember('task', 'task-1', existing);
    planUpdate.and.resolveTo(updateThingPlan(existing.uri, changes));
    commit.and.rejectWith({
      outcomes: [
        {
          operationIndex: 0,
          operation: {
            kind: 'rdf.patch',
            summary: 'update task',
            resourceUri: existing.source.uri,
            bodySha256: 'test-body',
          },
          status: 'completed',
          httpStatus: 200,
        },
      ],
    });
    get.and.resolveTo(podThing);

    const result = await TestBed.inject(SolidRepositoryOperations).update(mutation());

    expect(refresh).toHaveBeenCalledOnceWith({ uris: [existing.source.uri] });
    expect(result).toBe(podThing.uri);
  });

  it('does not reconcile or retry a plan rejected for profile drift', async () => {
    planUpdate.and.rejectWith({ code: 'write-plan-invalid' });

    await expectAsync(
      TestBed.inject(SolidRepositoryOperations).update(mutation()),
    ).toBeRejected();

    expect(planUpdate).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('leaves deferred recovery to the retryAt-aware persistence handler', async () => {
    const retryAt = new Date(Date.now() + 10_000);
    planUpdate.and.resolveTo(
      updateThingPlan('https://pod.example/tasks/task-1.ttl#it', changes),
    );
    commit.and.rejectWith({
      outcomes: [
        {
          operationIndex: 0,
          operation: {
            kind: 'rdf.patch',
            summary: 'update task',
            uri: 'https://pod.example/tasks/task-1.ttl',
            body: '',
          },
          status: 'failed',
          failure: { kind: 'deferred', phase: 'queued', retryAt },
        },
      ],
    });

    await expectAsync(
      TestBed.inject(SolidRepositoryOperations).update(mutation()),
    ).toBeRejected();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('plans subject-safe deletion and accepts an authoritative absent result', async () => {
    const identities = TestBed.inject(SolidThingIdentityRegistry);
    const existing = thing('https://pod.example/tasks/shared.ttl#todo');
    identities.remember('task', 'task-1', existing);
    planDelete.and.resolveTo(deleteThingPlan(existing.uri));
    commit.and.rejectWith({
      outcomes: [
        {
          operationIndex: 0,
          operation: { kind: 'rdf.subject-delete', uri: existing.uri },
          status: 'unknown',
          failure: { kind: 'network', phase: 'dispatched' },
        },
      ],
    });
    get.and.resolveTo(null);

    await TestBed.inject(SolidRepositoryOperations).delete(
      'task',
      'task-1',
      profile,
      'task-1',
    );

    expect(planDelete).toHaveBeenCalledOnceWith(existing.uri);
    expect(refresh).toHaveBeenCalledOnceWith({
      uris: ['https://pod.example/tasks/shared.ttl'],
    });
  });

  const mutation = (): SolidRepositoryMutation<string> => ({
    model: 'task',
    id: 'task-1',
    value: 'task-1',
    resourceName: 'task-1',
    profile,
    createInput,
    changes,
    map: (value: Thing): string => value.uri,
  });

  const thing = (uri: string): Thing =>
    ({ uri, source: { uri: uri.split('#')[0], kind: 'rdf' } }) as Thing;
});
