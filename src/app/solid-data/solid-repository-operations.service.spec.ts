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

describe('SolidRepositoryOperations', () => {
  const profile = {
    type: 'Task',
    name: 'Task',
    defaultStatus: 'open',
    target: { containerUri: 'https://pod.example/tasks/' },
  } as ThingWriteProfile;
  const createInput = { profile, target: { resourceName: 'task-1' } } as CreateThingInput;
  const changes = { title: 'safe test value' } as ThingChanges;
  let runtime: SolidRuntime;
  let query: jasmine.Spy;
  let create: jasmine.Spy;
  let get: jasmine.Spy;
  let refresh: jasmine.Spy;
  let planUpdate: jasmine.Spy;
  let commit: jasmine.Spy;

  beforeEach(() => {
    query = jasmine.createSpy('query');
    create = jasmine.createSpy('create');
    get = jasmine.createSpy('get');
    refresh = jasmine.createSpy('refresh').and.resolveTo();
    planUpdate = jasmine.createSpy('planUpdate').and.returnValue({ kind: 'plan' });
    commit = jasmine.createSpy('commit');
    runtime = {
      things: { query, create, get },
      discovery: { refresh },
      writes: { planUpdate, commit },
    } as unknown as SolidRuntime;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: { client: runtime },
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
    commit.and.resolveTo({ kind: 'thing.update', result: updated });

    await TestBed.inject(SolidRepositoryOperations).upsert(mutation());

    expect(planUpdate).toHaveBeenCalledOnceWith(existing.uri, changes);
    expect(query).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refreshes and accepts the Pod version after a deterministic create conflict', async () => {
    const podThing = thing('https://pod.example/tasks/task-1.ttl#it');
    create.and.rejectWith({
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
