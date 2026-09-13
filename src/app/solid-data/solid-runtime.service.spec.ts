import { TestBed } from '@angular/core/testing';
import type {
  AuthState,
  RuntimeLayout,
  RuntimeLayoutInput,
  RuntimeRdfBatch,
  RuntimeRdfQuad,
  SolidRuntime,
} from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import { SOLID_RUNTIME } from './solid-runtime.token';
import {
  ICAL_VTODO_CLASS,
  SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS,
  SOLID_PRODUCTIVITY_TASK_TYPE,
} from './solid-productivity-vocab';

describe('SolidRuntimeService', () => {
  const webId = 'https://id.example/profile/card#me';
  const storageRoot = 'https://pod.example/';
  let podUrl: string;
  let authState: AuthState;
  let completeProfile: boolean;
  let runtime: SolidRuntime;
  let listContainer: jasmine.Spy;
  let planContainerCreate: jasmine.Spy;
  let commit: jasmine.Spy;
  let register: jasmine.Spy;

  beforeEach(() => {
    podUrl = 'https://mock-pod.local/';
    authState = { status: 'authenticated', webId };
    completeProfile = true;
    listContainer = jasmine.createSpy('listContainer').and.resolveTo({
      uri: '',
      status: 'missing',
      entries: [],
      readAt: new Date(),
      httpStatus: 404,
    });
    planContainerCreate = jasmine
      .createSpy('planContainerCreate')
      .and.callFake(async (uri: string) => ({
        version: 4,
        kind: 'container.create',
        uri,
      }));
    commit = jasmine.createSpy('commit').and.resolveTo({ kind: 'container.create' });
    register = jasmine.createSpy('register').and.callFake((profile) => profile);
    runtime = {
      boot: async (options) => {
        if (options?.podUrl !== undefined) podUrl = options.podUrl;
      },
      close: async () => undefined,
      auth: {
        state: () => authState,
        fetch: () => fetch,
        restoreSession: async () => authState,
        login: async () => undefined,
        logout: async () => undefined,
      },
      diagnostics: { status: () => ({ podUrl }) },
      layouts: { define: (input) => resolveLayout(input, podUrl) },
      types: {
        register,
        view: (type: string) => ({
          name: type,
          read: (thing) => ({ thing, fields: {} }),
        }),
      },
      resources: { readRdf: () => profileBatches() },
      storage: { listContainer },
      writes: { planContainerCreate, commit },
    } as unknown as SolidRuntime;
    TestBed.configureTestingModule({
      providers: [{ provide: SOLID_RUNTIME, useValue: runtime }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('registers every semantic profile after defining the layout', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: storageRoot });

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
    expect(register.calls.count()).toBeGreaterThan(15);
    expect(register).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: SOLID_PRODUCTIVITY_TASK_TYPE,
        classUri: ICAL_VTODO_CLASS,
        classUris: [SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS],
      }),
    );
  });

  it('trusts a WebID storage root only after the RDF stream completes', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    expect(await service.resolveAuthenticatedStorageRoot()).toBe('changed');
    expect(service.taskProfile.target?.containerUri).toContain('https://pod.example/');

    podUrl = 'https://mock-pod.local/';
    completeProfile = false;
    expect(await service.resolveAuthenticatedStorageRoot()).toBe('unavailable');
    expect(podUrl).toBe('https://mock-pod.local/');
  });

  it('creates missing parents shortest-path first through version-4 plans', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: storageRoot });
    await service.ensureAppContainer(
      'https://pod.example/super-productivity/archive/tasks/',
    );

    expect(planContainerCreate.calls.allArgs().map(([uri]) => uri)).toEqual([
      'https://pod.example/super-productivity/',
      'https://pod.example/super-productivity/archive/',
      'https://pod.example/super-productivity/archive/tasks/',
    ]);
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it('re-lists and accepts a concurrently created container', async () => {
    listContainer.and.returnValues(
      Promise.resolve({ status: 'missing', entries: [], httpStatus: 404 }),
      Promise.resolve({ status: 'ok', entries: [], httpStatus: 200 }),
    );
    commit.and.rejectWith(new Error('conflict'));
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: storageRoot });

    await expectAsync(
      service.ensureAppContainer('https://pod.example/super-productivity/'),
    ).toBeResolved();
  });

  it('rejects containers outside the verified storage root', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: storageRoot });
    await expectAsync(
      service.ensureAppContainer('https://other.example/tasks/'),
    ).toBeRejectedWithError(/outside the verified storage root/);
  });

  async function* profileBatches(): AsyncIterable<RuntimeRdfBatch> {
    yield {
      version: 1,
      source: {
        uri: webId,
        requestedUri: webId,
        readId: 'read-1',
        metadata: { uri: webId, status: 'ok', readAt: new Date() },
      },
      quads: [
        quad('http://www.w3.org/ns/pim/space#storage', storageRoot),
        quad(
          'http://www.w3.org/ns/solid/terms#publicTypeIndex',
          'https://id.example/settings/publicTypeIndex.ttl',
        ),
      ],
      complete: completeProfile,
    };
  }

  const quad = (predicate: string, object: string): RuntimeRdfQuad =>
    ({
      subject: { termType: 'NamedNode' as const, value: webId },
      predicate: { termType: 'NamedNode' as const, value: predicate },
      object: { termType: 'NamedNode' as const, value: object },
      graph: { termType: 'DefaultGraph' as const, value: '' as const },
    }) as RuntimeRdfQuad;
});

const resolveLayout = (input: RuntimeLayoutInput, podUrl: string): RuntimeLayout => ({
  namespace: input.namespace,
  containers: Object.fromEntries(
    Object.entries(input.containers).map(([key, path]) => [
      key,
      new URL(`${path}/`, podUrl).toString(),
    ]),
  ),
  types: Object.fromEntries(
    Object.entries(input.types ?? {}).map(([type, definition]) => [
      type,
      {
        name: type,
        type,
        defaultStatus: definition.defaultStatus,
        target:
          definition.container === undefined
            ? undefined
            : {
                containerUri: new URL(
                  `${input.containers[definition.container]}/`,
                  podUrl,
                ).toString(),
              },
      },
    ]),
  ),
});
