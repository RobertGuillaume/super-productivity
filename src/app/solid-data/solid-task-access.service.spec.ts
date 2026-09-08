import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import type { RdfValue, SolidRuntime, Thing, ThingView } from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskAccessService } from './solid-task-access.service';

describe('SolidTaskAccessService', () => {
  const webId = 'https://pod.example/profile/card#me';
  let authState: ReturnType<SolidRuntime['auth']['state']>;
  let authenticatedFetch: jasmine.Spy;
  let resolvePermissions: jasmine.Spy;
  let service: SolidTaskAccessService;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    authenticatedFetch = jasmine.createSpy('authenticatedFetch');
    authenticatedFetch.and.resolveTo(response(200));
    resolvePermissions = jasmine.createSpy('resolvePermissions');
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
              share: { resolvePermissions },
              diagnostics: { status: () => ({ requestScheduling: [] }) },
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

    expect(service.isMutationBlocked('app-task')).toBe(false);
    expect(resolvePermissions).not.toHaveBeenCalled();
  });

  it('grants external task writes for an exact effective WebID permission', async () => {
    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'fallback-acl',
      permissions: [{ agent: webId, read: true, write: true }],
    });
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    expect(service.isMutationBlocked('external-task')).toBe(true);
    await service.refreshExternalPermissions();

    expect(service.isMutationBlocked('external-task')).toBe(false);
    expect(service.accessDecision('external-task')).toEqual({ state: 'writable' });
  });

  it('uses an effective WAC-Allow response for an external task resource', async () => {
    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['WAC-Allow', 'user="read write"']])),
    );
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.isMutationBlocked('external-task')).toBe(false);
    expect(authenticatedFetch).toHaveBeenCalledOnceWith(
      'https://pod.example/calendar/tasks.ttl',
      { method: 'HEAD' },
    );
    expect(resolvePermissions).not.toHaveBeenCalled();
  });

  it('labels only an explicit matching denial as read-only', async () => {
    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'resource-acl',
      permissions: [{ agent: webId, read: true, write: false }],
    });
    service.registerThing(
      'explicit-denial',
      thing('https://pod.example/calendar/denied.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.isReadOnly('explicit-denial')).toBe(true);
    expect(service.isMutationBlocked('explicit-denial')).toBe(true);
  });

  it('keeps ambiguous and unavailable ACL results blocked without calling them read-only', async () => {
    resolvePermissions.and.resolveTo({
      status: 'unknown',
      permissions: [],
      reason: 'acl-unavailable',
    });
    service.registerThing(
      'unknown-access',
      thing('https://pod.example/calendar/unknown.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.accessDecision('unknown-access')).toEqual({ state: 'unknown' });
    expect(service.isMutationBlocked('unknown-access')).toBe(true);
    expect(service.isReadOnly('unknown-access')).toBe(false);
  });

  it('keeps rate limiting transient and distinct from read-only access', async () => {
    const retryAt = new Date('2026-09-08T14:00:00.000Z');
    resolvePermissions.and.resolveTo({
      status: 'unknown',
      permissions: [],
      reason: 'rate-limited',
      retryAt,
    });
    service.registerThing(
      'rate-limited',
      thing('https://pod.example/calendar/rate-limited.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.accessDecision('rate-limited')).toEqual({
      state: 'rate-limited',
      retryAt,
    });
    expect(service.isMutationBlocked('rate-limited')).toBe(true);
    expect(service.isReadOnly('rate-limited')).toBe(false);
  });

  it('leaves external access unknown without an authenticated WebID', async () => {
    authState = { status: 'anonymous' };
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );

    await service.refreshExternalPermissions();

    expect(service.accessDecision('external-task')).toEqual({ state: 'unknown' });
    expect(resolvePermissions).not.toHaveBeenCalled();
  });

  it('checks one source once for multiple Things and repeated catalog registration', async () => {
    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['WAC-Allow', 'user="read write"']])),
    );
    service.registerThing(
      'external-task-1',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );
    service.registerThing(
      'external-task-2',
      thing('https://pod.example/calendar/tasks.ttl#todo-2'),
    );

    await service.scheduleExternalPermissionChecks();
    service.registerThing(
      'external-task-1',
      thing('https://pod.example/calendar/tasks.ttl#todo-1'),
    );
    await service.scheduleExternalPermissionChecks();

    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(service.accessDecision('external-task-1')).toEqual({ state: 'writable' });
    expect(service.accessDecision('external-task-2')).toEqual({ state: 'writable' });
  });

  it('retries a rate-limited source at the runtime-provided time', fakeAsync(() => {
    const retryAt = new Date(Date.now() + 1_000);
    resolvePermissions.and.returnValues(
      Promise.resolve({
        status: 'unknown',
        permissions: [],
        reason: 'rate-limited',
        retryAt,
      }),
      Promise.resolve({
        status: 'known',
        provenance: 'fallback-acl',
        permissions: [{ agent: webId, read: true, write: true }],
      }),
    );
    service.registerThing(
      'rate-limited',
      thing('https://pod.example/calendar/rate-limited.ttl#todo-1'),
    );

    void service.scheduleExternalPermissionChecks();
    flushMicrotasks();
    expect(service.accessDecision('rate-limited')).toEqual({
      state: 'rate-limited',
      retryAt,
    });

    tick(1_000);
    flushMicrotasks();

    expect(resolvePermissions).toHaveBeenCalledTimes(2);
    expect(service.accessDecision('rate-limited')).toEqual({ state: 'writable' });
  }));

  it('rechecks an ambiguous source only after direct user interest', async () => {
    resolvePermissions.and.returnValues(
      Promise.resolve({
        status: 'unknown',
        permissions: [],
        reason: 'unsupported-access-model',
      }),
      Promise.resolve({
        status: 'known',
        provenance: 'resource-acl',
        permissions: [{ agent: webId, read: true, write: true }],
      }),
    );
    service.registerThing(
      'external-task',
      thing('https://pod.example/calendar/interest.ttl#todo-1'),
    );

    await service.scheduleExternalPermissionChecks();
    await service.scheduleExternalPermissionChecks();
    expect(resolvePermissions).toHaveBeenCalledTimes(1);

    service.prioritizeTask('external-task');
    await service.scheduleExternalPermissionChecks();

    expect(resolvePermissions).toHaveBeenCalledTimes(2);
    expect(service.accessDecision('external-task')).toEqual({ state: 'writable' });
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
