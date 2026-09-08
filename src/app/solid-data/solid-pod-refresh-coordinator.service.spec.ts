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
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import { SolidTaskAccessService } from './solid-task-access.service';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidNativeTaskIndexService } from './solid-native-task-index.service';
import { SolidMutationIntentContext } from './solid-mutation-intent-registry.service';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { EntityType, OpType } from '../op-log/core/operation.types';
import { AppDataComplete } from '../op-log/model/model-config';

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
  let nativeTaskIndex: jasmine.SpyObj<SolidNativeTaskIndexService>;
  let hydration: jasmine.SpyObj<SolidTaskHydrationService>;
  let runtimeService: jasmine.SpyObj<SolidRuntimeService>;
  let dataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let mutations: jasmine.SpyObj<SolidMutationCoordinator>;
  let taskAccess: jasmine.SpyObj<SolidTaskAccessService>;
  let catalogAuthority: jasmine.SpyObj<SolidCatalogAuthorityService>;
  let identities: jasmine.SpyObj<SolidThingIdentityRegistry>;
  let containerAccess: jasmine.SpyObj<SolidContainerAccessService>;
  let authState: AuthState;
  let status: DiscoveryStatus;
  let thingSubscriber: (() => void) | null;
  let subscriptionInstallCount: number;

  beforeEach(() => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
    authState = {
      status: 'authenticated',
      webId: 'https://pod.example/profile/card#me',
    };
    status = discoveryStatus();
    thingSubscriber = null;
    subscriptionInstallCount = 0;
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
    nativeTaskIndex = jasmine.createSpyObj<SolidNativeTaskIndexService>(
      'SolidNativeTaskIndexService',
      ['readTargets'],
    );
    nativeTaskIndex.readTargets.and.resolveTo({
      resourceUris: [],
      containerUris: [],
      diagnosticCount: 0,
    });
    storage = jasmine.createSpyObj('storage', ['listContainer']);
    storage.listContainer.and.callFake(async (uri: string) => containerListing(uri));
    hydration = jasmine.createSpyObj<SolidTaskHydrationService>(
      'SolidTaskHydrationService',
      [
        'reconcileStore',
        'restoreLastPublishedSnapshot',
        'restoreProjection',
        'resetCatalogBaseline',
        'hasDegradedState',
      ],
    );
    hydration.reconcileStore.and.resolveTo({
      appDataComplete: {} as never,
      metadata: [],
      diagnostics: [],
      modelOutcomes: [],
      degraded: false,
    });
    hydration.hasDegradedState.and.returnValue(false);
    dataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      [
        'setPhase',
        'setRefreshProgress',
        'addDiagnostics',
        'clearWriteReadiness',
        'setContainerReadiness',
        'registerMutationRecoveryHandler',
      ],
    );
    mutations = jasmine.createSpyObj<SolidMutationCoordinator>(
      'SolidMutationCoordinator',
      ['whenIdle', 'completeFailedIntent'],
    );
    mutations.whenIdle.and.resolveTo();
    taskAccess = jasmine.createSpyObj<SolidTaskAccessService>('SolidTaskAccessService', [
      'clear',
      'refreshExternalPermissions',
    ]);
    taskAccess.refreshExternalPermissions.and.resolveTo();
    catalogAuthority = jasmine.createSpyObj<SolidCatalogAuthorityService>(
      'SolidCatalogAuthorityService',
      ['recordListing', 'clear'],
    );
    identities = jasmine.createSpyObj<SolidThingIdentityRegistry>(
      'SolidThingIdentityRegistry',
      ['clear'],
    );
    containerAccess = jasmine.createSpyObj<SolidContainerAccessService>(
      'SolidContainerAccessService',
      ['check'],
    );
    containerAccess.check.and.resolveTo('writable');
    const runtime = {
      auth: { state: () => authState },
      discovery,
      storage,
      things: {
        subscribe: (_query: unknown, subscriber: () => void): (() => void) => {
          subscriptionInstallCount++;
          thingSubscriber = subscriber;
          return (): void => undefined;
        },
      },
    } as unknown as SolidRuntime;
    runtimeService = jasmine.createSpyObj<SolidRuntimeService>(
      'SolidRuntimeService',
      [
        'resolveAuthenticatedStorageRoot',
        'ensureAppContainer',
        'ensureLayout',
        'rememberAppContainerTree',
      ],
      { client: runtime },
    );
    runtimeService.resolveAuthenticatedStorageRoot.and.resolveTo('unchanged');
    runtimeService.ensureAppContainer.and.resolveTo();
    runtimeService.rememberAppContainerTree.and.callFake((_uri, known) => {
      known.add(_uri);
    });
    runtimeService.ensureLayout.and.returnValue({ containers } as never);

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidRuntimeService, useValue: runtimeService },
        { provide: SolidTaskHydrationService, useValue: hydration },
        { provide: SolidDataLayerStateService, useValue: dataLayerState },
        { provide: SolidMutationCoordinator, useValue: mutations },
        { provide: SolidTaskAccessService, useValue: taskAccess },
        { provide: SolidCatalogAuthorityService, useValue: catalogAuthority },
        { provide: SolidThingIdentityRegistry, useValue: identities },
        { provide: SolidContainerAccessService, useValue: containerAccess },
        { provide: SolidNativeTaskIndexService, useValue: nativeTaskIndex },
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
    discovery.refresh.and.callFake(async (options) => {
      (options?.uris ?? []).forEach(() => thingSubscriber?.());
    });

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
    expect(discovery.discoverType).not.toHaveBeenCalled();
    expect(taskAccess.refreshExternalPermissions).toHaveBeenCalled();
    expect(hydration.reconcileStore).toHaveBeenCalledTimes(31);
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('ready');
  });

  it('does not enable writes from a successful listing without proven access', async () => {
    containerAccess.check.and.resolveTo('read-only');

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(dataLayerState.setContainerReadiness).not.toHaveBeenCalledWith(
      jasmine.anything(),
      'writable',
    );
    expect(dataLayerState.setContainerReadiness).toHaveBeenCalledWith(
      'tasks',
      'checking',
    );
    expect(dataLayerState.setContainerReadiness).toHaveBeenCalledWith(
      'tasks',
      'read-only',
    );
  });

  it('publishes every app container before waiting for access checks', async () => {
    let releaseAccess!: () => void;
    const accessGate = new Promise<void>((resolve) => {
      releaseAccess = resolve;
    });
    containerAccess.check.and.callFake(async () => {
      await accessGate;
      return 'writable';
    });

    const refresh = TestBed.inject(SolidPodRefreshCoordinatorService).start();
    const containerCount = Object.keys(containers).length;
    for (let turn = 0; turn < containerCount * 20; turn++) {
      await Promise.resolve();
    }
    const listedBeforeAccessSettled = storage.listContainer.calls.count();
    const reconciledBeforeAccessSettled = hydration.reconcileStore.calls.count();
    const accessChecksBeforeSettled = containerAccess.check.calls.count();
    releaseAccess();
    await refresh;

    expect(listedBeforeAccessSettled).toBe(containerCount);
    expect(reconciledBeforeAccessSettled).toBeGreaterThanOrEqual(containerCount);
    expect(accessChecksBeforeSettled).toBe(2);
  });

  it('does not start the runtime storage-root fallback without indexed VTODO targets', async () => {
    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(nativeTaskIndex.readTargets).toHaveBeenCalledTimes(1);
    expect(discovery.discoverType).not.toHaveBeenCalled();
    expect(taskAccess.refreshExternalPermissions).toHaveBeenCalled();
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
    expect(nativeTaskIndex.readTargets).not.toHaveBeenCalled();
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
    const initialSubscriptionCount = subscriptionInstallCount;

    await service.restartAfterRuntimeBoot();

    expect(hydration.reconcileStore).toHaveBeenCalled();
    expect(subscriptionInstallCount).toBeGreaterThan(initialSubscriptionCount);
    expect(runtimeService.resolveAuthenticatedStorageRoot).toHaveBeenCalledTimes(2);
  });

  it('deduplicates one intent recovery and refreshes only affected targets', async () => {
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    discovery.refresh.calls.reset();
    discovery.discoverType.calls.reset();
    storage.listContainer.calls.reset();
    hydration.reconcileStore.calls.reset();
    const context = mutationContext({
      resourceUris: [`${containers.tasks}task-1.ttl`],
      containerKeys: ['tasks'],
    });

    const first = service.recoverRejectedMutation(context);
    const second = service.recoverRejectedMutation(context);

    expect(second).toBe(first);
    await first;
    expect(storage.listContainer).toHaveBeenCalledOnceWith(containers.tasks);
    expect(discovery.refresh).toHaveBeenCalledWith({
      uris: [`${containers.tasks}task-1.ttl`],
    });
    expect(discovery.discoverType).not.toHaveBeenCalled();
    expect(hydration.reconcileStore).toHaveBeenCalledTimes(1);
  });

  it('restores the captured projection when targeted refresh is not authoritative', async () => {
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    discovery.discoverType.calls.reset();
    storage.listContainer.calls.reset();
    storage.listContainer.and.resolveTo(
      containerListing(containers.tasks, [], 'inaccessible', 503),
    );
    hydration.restoreProjection.calls.reset();
    hydration.reconcileStore.calls.reset();
    const projection = {} as AppDataComplete;
    const context = mutationContext({
      containerKeys: ['tasks'],
      projection,
    });

    await service.recoverRejectedMutation(context);

    expect(hydration.restoreProjection).toHaveBeenCalledOnceWith(projection);
    expect(hydration.reconcileStore).not.toHaveBeenCalled();
    expect(dataLayerState.setContainerReadiness).toHaveBeenCalledWith(
      'tasks',
      'unavailable',
    );
    expect(discovery.discoverType).not.toHaveBeenCalled();
  });
});

const mutationContext = (
  overrides: Partial<SolidMutationIntentContext> = {},
): SolidMutationIntentContext => ({
  action: {
    type: '[TaskShared] Update Task',
    meta: {
      isPersistent: true,
      entityType: 'TASK' as EntityType,
      entityId: 'task-1',
      opType: OpType.Update,
    },
  } as PersistentAction,
  actionType: '[TaskShared] Update Task',
  entityKeys: ['task:task-1'],
  resourceUris: [],
  containerKeys: ['tasks'],
  projection: null,
  catalogGeneration: 1,
  ...overrides,
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
