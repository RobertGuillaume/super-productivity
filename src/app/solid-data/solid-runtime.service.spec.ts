import { TestBed } from '@angular/core/testing';
import type {
  AuthState,
  RuntimeBootOptions,
  RuntimeDiagnostics,
  RuntimeLayout,
  RuntimeLayoutInput,
  RuntimeLayoutTypeInput,
  SolidRuntime,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import { SOLID_RUNTIME } from './solid-runtime.token';
import {
  ICAL_VTODO_CLASS,
  SOLID_PRODUCTIVITY_LAYOUT,
  SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS,
  SOLID_PRODUCTIVITY_TASK_TYPE,
} from './solid-productivity-vocab';
import { SOLID_STORAGE_ROOT_CACHE_KEY } from './solid-storage-root-cache.service';

describe('SolidRuntimeService', () => {
  let authState: AuthState;
  let podUrl: string;
  let existingContainerUris: Set<string>;
  let fetchRequests: Array<{ uri: string; method: string }>;
  let profileFetchError: Error | null;

  const mockPodUrl = 'https://mock-pod.local/';
  const authenticatedWebId = 'https://id.example/profile/card#me';
  const runtimeResolvedPodUrl = 'https://id.example/';
  const discoveredStorageRoot = 'https://pod.example/';
  const publicTypeIndex = 'https://id.example/settings/publicTypeIndex.ttl';

  beforeEach(() => {
    localStorage.removeItem(SOLID_STORAGE_ROOT_CACHE_KEY);
    authState = { status: 'anonymous' };
    podUrl = mockPodUrl;
    existingContainerUris = new Set([mockPodUrl, discoveredStorageRoot]);
    fetchRequests = [];
    profileFetchError = null;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SOLID_RUNTIME,
          useFactory: (): SolidRuntime => createRuntimeStub(),
        },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(SOLID_STORAGE_ROOT_CACHE_KEY));

  it('defines the layout against the booted pod', async () => {
    const service = TestBed.inject(SolidRuntimeService);

    await service.boot({ podUrl: discoveredStorageRoot });

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
  });

  it('writes native Vtodo tasks while retaining the legacy task class alias', () => {
    expect(SOLID_PRODUCTIVITY_TASK_TYPE).toBe('Task');
    expect(SOLID_PRODUCTIVITY_LAYOUT.types.Task).toEqual(
      jasmine.objectContaining({
        classUri: ICAL_VTODO_CLASS,
        classUris: [SOLID_PRODUCTIVITY_LEGACY_TASK_CLASS],
      }),
    );
  });

  it('rebuilds a cached layout when the runtime reboots from mock mode to a pod', async () => {
    const service = TestBed.inject(SolidRuntimeService);

    await service.boot();
    expect(service.taskProfile.target?.containerUri).toBe(
      'https://mock-pod.local/super-productivity/tasks/',
    );

    await service.boot({ podUrl: discoveredStorageRoot });

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
    expect(service.getVerifiedTypeIndexUris()).toBeNull();
  });

  it('discovers and activates the WebID storage root after session restore', async () => {
    const service = TestBed.inject(SolidRuntimeService);

    await service.boot();
    expect(service.taskProfile.target?.containerUri).toBe(
      'https://mock-pod.local/super-productivity/tasks/',
    );

    await service.restoreSession();

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://id.example/super-productivity/tasks/',
    );
    expect(service.getVerifiedTypeIndexUris()).toBeNull();
    await expectAsync(service.resolveAuthenticatedStorageRoot()).toBeResolvedTo(
      'changed',
    );

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
    expect(service.getVerifiedTypeIndexUris()).toEqual([publicTypeIndex]);
  });

  it('keeps the booted catalog available when the storage profile cannot be read', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    profileFetchError = new Error('profile unavailable');
    await service.restoreSession();

    await expectAsync(service.resolveAuthenticatedStorageRoot()).toBeResolvedTo(
      'unavailable',
    );
    expect(service.taskProfile.target?.containerUri).toBe(
      'https://id.example/super-productivity/tasks/',
    );
    expect(service.getVerifiedTypeIndexUris()).toBeNull();
  });

  it('does not block boot restore on WebID profile discovery', async () => {
    const service = TestBed.inject(SolidRuntimeService);

    await service.boot();
    expect(service.taskProfile.target?.containerUri).toBe(
      'https://mock-pod.local/super-productivity/tasks/',
    );

    await service.boot({ restoreSession: true });

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://id.example/super-productivity/tasks/',
    );
  });

  it('activates the remembered root before cached catalog hydration', async () => {
    localStorage.setItem(
      SOLID_STORAGE_ROOT_CACHE_KEY,
      JSON.stringify({ [authenticatedWebId]: discoveredStorageRoot }),
    );
    const service = TestBed.inject(SolidRuntimeService);

    await service.boot({ restoreSession: true });
    await expectAsync(service.activateRememberedStorageRoot()).toBeResolvedTo('changed');

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
  });

  it('remembers a successfully discovered storage root', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.restoreSession();

    await service.resolveAuthenticatedStorageRoot();

    expect(
      JSON.parse(localStorage.getItem(SOLID_STORAGE_ROOT_CACHE_KEY) ?? '{}'),
    ).toEqual({ [authenticatedWebId]: discoveredStorageRoot });
  });

  it('rebuilds a cached layout if the runtime pod changes internally', () => {
    const service = TestBed.inject(SolidRuntimeService);

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://mock-pod.local/super-productivity/tasks/',
    );

    podUrl = discoveredStorageRoot;

    expect(service.taskProfile.target?.containerUri).toBe(
      'https://pod.example/super-productivity/tasks/',
    );
  });

  it('creates the app container tree before upload writes', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: discoveredStorageRoot });

    await service.ensureAppContainers();

    const createdContainerUris = putUris();
    expect(createdContainerUris).toEqual(
      jasmine.arrayContaining([
        'https://pod.example/super-productivity/',
        'https://pod.example/super-productivity/app/',
        'https://pod.example/super-productivity/tags/',
        'https://pod.example/super-productivity/tasks/',
        'https://pod.example/super-productivity/notes/',
        'https://pod.example/super-productivity/boards/',
        'https://pod.example/super-productivity/config/',
        'https://pod.example/super-productivity/metrics/',
        'https://pod.example/super-productivity/planner/',
        'https://pod.example/super-productivity/projects/',
        'https://pod.example/super-productivity/sections/',
        'https://pod.example/super-productivity/archive/',
        'https://pod.example/super-productivity/menu-tree/',
        'https://pod.example/super-productivity/time-tracking/',
        'https://pod.example/super-productivity/simple-counters/',
        'https://pod.example/super-productivity/issue-providers/',
        'https://pod.example/super-productivity/repeat-configs/',
        'https://pod.example/super-productivity/plugins/',
        'https://pod.example/super-productivity/archive/tasks/',
        'https://pod.example/super-productivity/archive/state/',
        'https://pod.example/super-productivity/plugins/user-data/',
        'https://pod.example/super-productivity/plugins/metadata/',
      ]),
    );
    expect(createdContainerUris.length).toBe(22);
    expect(createdContainerUris.indexOf('https://pod.example/super-productivity/'))
      .withContext('root app container should be created first')
      .toBe(0);
    expect(
      createdContainerUris.indexOf('https://pod.example/super-productivity/archive/'),
    )
      .withContext('archive parent should be created before archive children')
      .toBeLessThan(
        createdContainerUris.indexOf(
          'https://pod.example/super-productivity/archive/tasks/',
        ),
      );
    expect(
      createdContainerUris.indexOf('https://pod.example/super-productivity/plugins/'),
    )
      .withContext('plugins parent should be created before plugin children')
      .toBeLessThan(
        createdContainerUris.indexOf(
          'https://pod.example/super-productivity/plugins/user-data/',
        ),
      );
  });

  it('reuses known parents and skips the probe for a listing-proven missing target', async () => {
    const service = TestBed.inject(SolidRuntimeService);
    await service.boot({ podUrl: discoveredStorageRoot });
    const known = new Set<string>();
    const firstTarget = 'https://pod.example/super-productivity/archive/tasks/';
    const secondTarget = 'https://pod.example/super-productivity/archive/state/';

    await service.ensureAppContainer(firstTarget, known);
    await service.ensureAppContainer(secondTarget, known);

    expect(
      fetchRequests.filter(
        ({ uri, method }) =>
          uri === 'https://pod.example/super-productivity/archive/' && method === 'HEAD',
      ).length,
    ).toBe(1);
    expect(
      fetchRequests.some(({ uri, method }) => uri === firstTarget && method === 'HEAD'),
    ).toBe(false);
    expect(
      fetchRequests.some(({ uri, method }) => uri === secondTarget && method === 'HEAD'),
    ).toBe(false);
  });

  const createRuntimeStub = (): SolidRuntime =>
    ({
      boot: async (options: RuntimeBootOptions = {}): Promise<void> => {
        if (options.restoreSession === true) {
          authState = {
            status: 'authenticated',
            webId: authenticatedWebId,
          };
          podUrl = runtimeResolvedPodUrl;
          return;
        }

        podUrl = normalizeContainerUrl(options.podUrl ?? mockPodUrl);
      },
      auth: {
        state: (): AuthState => authState,
        capabilities: () => ({
          browserSessionRestore: true,
          headlessSessionRestore: false,
          suppliedFetch: podUrl !== mockPodUrl,
          message: '',
        }),
        subscribe: (listener: (state: AuthState) => void) => {
          listener(authState);
          return (): void => undefined;
        },
        login: async (): Promise<void> => undefined,
        handleRedirect: async (): Promise<void> => undefined,
        restoreSession: async (): Promise<AuthState> => {
          authState = {
            status: 'authenticated',
            webId: authenticatedWebId,
          };
          podUrl = runtimeResolvedPodUrl;
          return authState;
        },
        logout: async (): Promise<void> => {
          authState = { status: 'anonymous' };
        },
        fetch: (): typeof fetch => authenticatedFetch,
      },
      layouts: {
        define: (input: RuntimeLayoutInput): RuntimeLayout => createLayout(input, podUrl),
      },
      diagnostics: {
        status: (): RuntimeDiagnostics => ({
          podUrl,
          storageRoots: [podUrl],
          catalog: {
            thingRecords: 0,
            resourceRecords: 0,
            staleResources: 0,
            refreshingResources: 0,
            inaccessibleResources: 0,
            invalidResources: 0,
            missingResources: 0,
          },
          discovery: {
            state: 'idle',
            queuedJobs: 0,
            inFlightJobs: 0,
            completedJobs: 0,
            maxConcurrentJobs: 0,
          },
          auth: authState,
          authCapabilities: {
            browserSessionRestore: true,
            headlessSessionRestore: false,
            headlessInteractiveLogin: false,
            suppliedFetch: podUrl !== mockPodUrl,
            message: '',
          },
          typeIndexWrites: {
            recent: [],
          },
          requestScheduling: [],
        }),
        typeIndexes: async () => ({
          available: false,
          typeIndexUris: [],
          registrations: [],
          failures: [],
        }),
        inspectThing: async () => {
          throw new Error('Not implemented');
        },
        explainQuery: async () => {
          throw new Error('Not implemented');
        },
      },
    }) as unknown as SolidRuntime;

  const createLayout = (
    input: RuntimeLayoutInput,
    currentPodUrl: string,
  ): RuntimeLayout => {
    const containers = Object.fromEntries(
      Object.entries(input.containers).map(([name, containerUri]) => [
        name,
        normalizeContainerUrl(new URL(containerUri, currentPodUrl).toString()),
      ]),
    );
    const typeEntries = Object.entries(input.types ?? {}) as ReadonlyArray<
      [string, RuntimeLayoutTypeInput]
    >;
    const types = Object.fromEntries(
      typeEntries.map(([type, typeInput]) => {
        const target =
          typeInput.container === undefined
            ? undefined
            : {
                containerUri: getContainerUri(containers, typeInput.container),
              };

        return [
          type,
          {
            name: type,
            type,
            defaultStatus: typeInput.defaultStatus,
            target,
          } satisfies ThingWriteProfile,
        ];
      }),
    );

    return {
      namespace: input.namespace,
      containers,
      types,
    };
  };

  const normalizeContainerUrl = (uri: string): string =>
    uri.endsWith('/') ? uri : `${uri}/`;

  const authenticatedFetch: typeof fetch = async (input, init) => {
    const uri = typeof input === 'string' ? input : input.url;
    const method = init?.method ?? 'GET';
    fetchRequests.push({ uri, method });

    if (
      profileFetchError !== null &&
      (uri === authenticatedWebId || uri === authenticatedWebId.split('#')[0])
    ) {
      throw profileFetchError;
    }

    if (method === 'HEAD') {
      return new Response(null, {
        status: existingContainerUris.has(uri) ? 200 : 404,
      });
    }

    if (method === 'PUT') {
      existingContainerUris.add(uri);
      return new Response(null, { status: 201 });
    }

    return new Response(
      `@prefix pim: <http://www.w3.org/ns/pim/space#> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
<${authenticatedWebId}> pim:storage <${discoveredStorageRoot}>;
  solid:publicTypeIndex <${publicTypeIndex}> .`,
      {
        headers: new Headers([['Content-Type', 'text/turtle']]),
      },
    );
  };

  const putUris = (): string[] =>
    fetchRequests
      .filter((request) => request.method === 'PUT')
      .map((request) => request.uri);

  const getContainerUri = (
    containers: Record<string, string>,
    containerName: string,
  ): string => {
    const containerUri = containers[containerName];
    if (containerUri === undefined) {
      throw new Error(`Unknown container ${containerName}`);
    }
    return containerUri;
  };
});
