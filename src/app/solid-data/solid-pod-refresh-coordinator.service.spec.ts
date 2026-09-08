import { TestBed } from '@angular/core/testing';
import type {
  AuthState,
  ContainerListing,
  DiscoveryStatus,
  SolidRuntime,
} from '@solid-intents/runtime';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidPodRefreshCoordinatorService } from './solid-pod-refresh-coordinator.service';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import { SolidTaskAccessService } from './solid-task-access.service';

describe('SolidPodRefreshCoordinatorService', () => {
  const podRoot = 'https://pod.example/';
  const containers = {
    notes: `${podRoot}super-productivity/notes/`,
    config: `${podRoot}super-productivity/config/`,
    tasks: `${podRoot}super-productivity/tasks/`,
    tags: `${podRoot}super-productivity/tags/`,
    app: `${podRoot}super-productivity/app/`,
    projects: `${podRoot}super-productivity/projects/`,
  };
  let discovery: jasmine.SpyObj<SolidRuntime['discovery']>;
  let storage: jasmine.SpyObj<SolidRuntime['storage']>;
  let hydration: jasmine.SpyObj<SolidTaskHydrationService>;
  let runtimeService: jasmine.SpyObj<SolidRuntimeService>;
  let dataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let mutations: jasmine.SpyObj<SolidMutationCoordinator>;
  let taskAccess: jasmine.SpyObj<SolidTaskAccessService>;
  let authState: AuthState;
  let status: DiscoveryStatus;

  beforeEach(() => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
    authState = {
      status: 'authenticated',
      webId: 'https://pod.example/profile/card#me',
    };
    status = discoveryStatus();
    discovery = jasmine.createSpyObj('discovery', [
      'refresh',
      'discoverType',
      'status',
      'subscribe',
    ]);
    discovery.refresh.and.resolveTo();
    discovery.discoverType.and.resolveTo();
    discovery.status.and.callFake(() => status);
    discovery.subscribe.and.returnValue(() => undefined);
    storage = jasmine.createSpyObj('storage', ['listContainer']);
    storage.listContainer.and.callFake(async (uri: string) => containerListing(uri));
    hydration = jasmine.createSpyObj<SolidTaskHydrationService>(
      'SolidTaskHydrationService',
      ['reconcileStore', 'restoreLastPublishedSnapshot'],
    );
    hydration.reconcileStore.and.resolveTo({
      appDataComplete: {} as never,
      metadata: [],
      diagnostics: [],
    });
    dataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      [
        'setPhase',
        'setRefreshProgress',
        'addDiagnostics',
        'clearWriteReadiness',
        'setContainerWriteReady',
        'registerMutationRecoveryHandler',
      ],
    );
    mutations = jasmine.createSpyObj<SolidMutationCoordinator>(
      'SolidMutationCoordinator',
      ['whenIdle'],
    );
    mutations.whenIdle.and.resolveTo();
    taskAccess = jasmine.createSpyObj<SolidTaskAccessService>('SolidTaskAccessService', [
      'clear',
      'refreshExternalPermissions',
    ]);
    taskAccess.refreshExternalPermissions.and.resolveTo();
    const runtime = {
      auth: { state: () => authState },
      discovery,
      storage,
      things: {
        subscribe: () => (): void => undefined,
      },
    } as unknown as SolidRuntime;
    runtimeService = jasmine.createSpyObj<SolidRuntimeService>(
      'SolidRuntimeService',
      ['resolveAuthenticatedStorageRoot', 'ensureAppContainer', 'ensureLayout'],
      { client: runtime },
    );
    runtimeService.resolveAuthenticatedStorageRoot.and.resolveTo('unchanged');
    runtimeService.ensureAppContainer.and.resolveTo();
    runtimeService.ensureLayout.and.returnValue({ containers } as never);

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidRuntimeService, useValue: runtimeService },
        { provide: SolidTaskHydrationService, useValue: hydration },
        { provide: SolidDataLayerStateService, useValue: dataLayerState },
        { provide: SolidMutationCoordinator, useValue: mutations },
        { provide: SolidTaskAccessService, useValue: taskAccess },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('refreshes priority containers first and batches every listed resource', async () => {
    const taskEntries = Array.from({ length: 251 }, (_, index) => ({
      uri: `${containers.tasks}task-${index}.ttl`,
      kind: 'resource' as const,
    }));
    storage.listContainer.and.callFake(async (uri: string) =>
      containerListing(uri, uri === containers.tasks ? taskEntries : []),
    );

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(storage.listContainer.calls.allArgs().map(([uri]) => uri)).toEqual([
      containers.tasks,
      containers.projects,
      containers.tags,
      containers.app,
      containers.config,
      containers.notes,
    ]);
    const resourceRefreshes = discovery.refresh.calls
      .allArgs()
      .map(([options]) => options?.uris)
      .filter((uris): uris is string[] => uris !== undefined);
    expect(resourceRefreshes.length).toBe(26);
    expect(resourceRefreshes.every((uris) => uris.length <= 10)).toBe(true);
    expect(new Set(resourceRefreshes.flat()).size).toBe(251);
    expect(discovery.discoverType).toHaveBeenCalledOnceWith(SOLID_PRODUCTIVITY_TASK_TYPE);
    expect(taskAccess.refreshExternalPermissions).toHaveBeenCalled();
    expect(hydration.reconcileStore).toHaveBeenCalled();
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('ready');
  });

  it('creates a missing app container before refreshing it', async () => {
    storage.listContainer.and.callFake(async (uri: string) => {
      if (uri === containers.tasks && storage.listContainer.calls.count() === 1) {
        return containerListing(uri, [], 'missing', 404);
      }
      return containerListing(uri);
    });

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(runtimeService.ensureAppContainer).toHaveBeenCalledOnceWith(
      containers.tasks,
      jasmine.any(Set),
    );
    expect(storage.listContainer).toHaveBeenCalledWith(containers.tasks);
  });

  it('keeps cached data usable when a container is inaccessible', async () => {
    storage.listContainer.and.callFake(async (uri: string) =>
      uri === containers.projects
        ? containerListing(uri, [], 'inaccessible', 403)
        : containerListing(uri),
    );

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(dataLayerState.setPhase).toHaveBeenCalledWith('degraded');
    expect(dataLayerState.addDiagnostics).toHaveBeenCalled();
  });

  it('does not touch Pod containers while the storage root is unverified', async () => {
    runtimeService.resolveAuthenticatedStorageRoot.and.resolveTo('unavailable');

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(storage.listContainer).not.toHaveBeenCalled();
    expect(runtimeService.ensureAppContainer).not.toHaveBeenCalled();
    expect(discovery.subscribe).not.toHaveBeenCalled();
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('degraded');
  });

  it('starts the complete lifecycle when refresh is called before start', async () => {
    await TestBed.inject(SolidPodRefreshCoordinatorService).refreshNow();

    expect(runtimeService.resolveAuthenticatedStorageRoot).toHaveBeenCalledTimes(1);
    expect(storage.listContainer).toHaveBeenCalled();
  });

  it('rehydrates and reinstalls subscriptions after a runtime reboot', async () => {
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    const subscriptionCount = discovery.subscribe.calls.count();

    await service.restartAfterRuntimeBoot();

    expect(hydration.reconcileStore).toHaveBeenCalled();
    expect(discovery.subscribe.calls.count()).toBeGreaterThan(subscriptionCount);
    expect(runtimeService.resolveAuthenticatedStorageRoot).toHaveBeenCalledTimes(2);
  });
});

const discoveryStatus = (overrides: Partial<DiscoveryStatus> = {}): DiscoveryStatus => ({
  state: 'idle',
  queuedJobs: 0,
  inFlightJobs: 0,
  completedJobs: 0,
  maxConcurrentJobs: 3,
  ...overrides,
});

const containerListing = (
  uri: string,
  entries: ContainerListing['entries'] = [],
  status: ContainerListing['status'] = 'ok',
  httpStatus = 200,
): ContainerListing => ({
  uri,
  status,
  entries,
  readAt: new Date(0),
  httpStatus,
  contentType: 'text/turtle',
});
