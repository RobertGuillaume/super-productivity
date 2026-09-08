import { TestBed } from '@angular/core/testing';
import type { RdfValue, SolidRuntime, Thing, ThingView } from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskAccessService } from './solid-task-access.service';

describe('SolidTaskAccessService', () => {
  const webId = 'https://pod.example/profile/card#me';
  let authState: ReturnType<SolidRuntime['auth']['state']>;
  let authenticatedFetch: jasmine.Spy;
  let permissions: jasmine.Spy;
  let service: SolidTaskAccessService;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    authenticatedFetch = jasmine.createSpy('authenticatedFetch');
    authenticatedFetch.and.resolveTo(response(200));
    permissions = jasmine.createSpy('permissions');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            taskProfile: {
              target: {
                containerUri: 'https://pod.example/super-productivity/tasks/',
              },
            },
            client: {
              auth: {
                state: () => authState,
                fetch: () => authenticatedFetch,
              },
              share: { permissions },
            },
          },
        },
      ],
    });
    service = TestBed.inject(SolidTaskAccessService);
  });

  it('uses normal container readiness for app-owned tasks', async () => {
    service.registerThing(
      'app-task',
      thing('https://pod.example/super-productivity/tasks/app-task.ttl#it'),
    );

    await service.refreshExternalPermissions();

    expect(service.isReadOnly('app-task')).toBe(false);
    expect(permissions).not.toHaveBeenCalled();
  });

  it('grants external task writes only for an explicit matching WebID permission', async () => {
    permissions.and.resolveTo([{ agent: webId, read: true, write: true }]);
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    expect(service.isReadOnly('external-task')).toBe(true);
    await service.refreshExternalPermissions();

    expect(service.isReadOnly('external-task')).toBe(false);
  });

  it('uses an effective WAC-Allow response for an external task resource', async () => {
    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['WAC-Allow', 'user="read write"']])),
    );
    permissions.and.resolveTo([]);
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.isReadOnly('external-task')).toBe(false);
    expect(authenticatedFetch).toHaveBeenCalledOnceWith(
      'https://pod.example/calendar/tasks.ttl',
      { method: 'HEAD' },
    );
    expect(permissions).not.toHaveBeenCalled();
  });

  it('keeps explicit read-only, empty, and unrelated permissions read-only', async () => {
    permissions.and.resolveTo([
      { agent: webId, read: true, write: false },
      { agent: 'https://other.example/#me', read: true, write: true },
    ]);
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();
    expect(service.isReadOnly('external-task')).toBe(true);

    permissions.and.resolveTo([]);
    service.registerThing(
      'empty-permissions',
      thing('https://pod.example/calendar/empty.ttl#todo-2'),
    );
    await service.refreshExternalPermissions({ unknownOnly: true });
    expect(service.isReadOnly('empty-permissions')).toBe(true);
  });

  it('keeps a task read-only when permission lookup fails', async () => {
    permissions.and.rejectWith(new Error('ACL unavailable'));
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.isReadOnly('external-task')).toBe(true);
  });

  it('marks external tasks read-only without an authenticated WebID', async () => {
    authState = { status: 'anonymous' };
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.isReadOnly('external-task')).toBe(true);
    expect(permissions).not.toHaveBeenCalled();
  });
});

const thing = (uri: string): Thing => ({
  uri,
  content: { uri: uri.split('#')[0], kind: 'rdf', source: 'rdf' },
  source: { uri: uri.split('#')[0], kind: 'rdf' },
  types: [],
  facets: {},
  properties: {},
  links: {},
  known: {},
  freshness: { source: 'pod', loadedAt: new Date() },
  property: (): readonly RdfValue[] => [],
  objects: (): readonly string[] => [],
  as: <View>(_view: ThingView<View>): View => ({}) as View,
});

const response = (status: number, headers?: HeadersInit): Response =>
  new Response(null, { status, headers });
