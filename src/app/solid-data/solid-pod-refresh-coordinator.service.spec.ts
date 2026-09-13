import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidDiscoverySessionRegistryService } from './solid-discovery-session-registry.service';
import { SolidMutationCoordinator } from './solid-mutation-coordinator.service';
import { SolidMutationIntentRegistry } from './solid-mutation-intent-registry.service';
import { SolidPodRefreshCoordinatorService } from './solid-pod-refresh-coordinator.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskAccessService } from './solid-task-access.service';
import { SolidTaskHydrationService } from './solid-task-hydration.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';

describe('SolidPodRefreshCoordinatorService', () => {
  const webId = 'https://pod.example/profile/card#me';
  const layout = {
    containers: {
      tasks: 'https://pod.example/super-productivity/tasks/',
      projects: 'https://pod.example/super-productivity/projects/',
    },
    types: {},
  };
  let runtimeService: jasmine.SpyObj<SolidRuntimeService>;
  let sessions: jasmine.SpyObj<SolidDiscoverySessionRegistryService>;
  let hydration: jasmine.SpyObj<SolidTaskHydrationService>;
  let dataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let discovery: jasmine.SpyObj<SolidRuntime['discovery']>;

  beforeEach(() => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
    const authState: AuthState = { status: 'authenticated', webId };
    discovery = jasmine.createSpyObj('discovery', ['refresh']);
    discovery.refresh.and.resolveTo();
    const runtime = {
      auth: { state: () => authState },
      discovery,
      things: { subscribe: () => (): void => undefined },
    } as unknown as SolidRuntime;
    runtimeService = jasmine.createSpyObj<SolidRuntimeService>(
      'SolidRuntimeService',
      ['resolveAuthenticatedStorageRoot', 'ensureAppContainers', 'ensureLayout'],
      { client: runtime },
    );
    runtimeService.resolveAuthenticatedStorageRoot.and.resolveTo('unchanged');
    runtimeService.ensureAppContainers.and.resolveTo();
    runtimeService.ensureLayout.and.returnValue(layout as never);
    sessions = jasmine.createSpyObj<SolidDiscoverySessionRegistryService>(
      'SolidDiscoverySessionRegistryService',
      ['initialize', 'runStartupPass', 'refreshAndRun', 'pause', 'isDegraded'],
    );
    sessions.initialize.and.resolveTo();
    sessions.runStartupPass.and.resolveTo();
    sessions.refreshAndRun.and.resolveTo();
    sessions.pause.and.resolveTo();
    sessions.isDegraded.and.returnValue(false);
    hydration = jasmine.createSpyObj<SolidTaskHydrationService>(
      'SolidTaskHydrationService',
      [
        'reconcileStore',
        'resetCatalogBaseline',
        'hasDegradedState',
        'restoreProjection',
        'restoreLastPublishedSnapshot',
      ],
    );
    hydration.reconcileStore.and.resolveTo({} as never);
    hydration.hasDegradedState.and.returnValue(false);
    dataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      [
        'registerMutationRecoveryHandler',
        'setPhase',
        'setRefreshProgress',
        'clearWriteReadiness',
        'setContainerReadiness',
        'addDiagnostics',
      ],
    );
    const mutations = jasmine.createSpyObj<SolidMutationCoordinator>(
      'SolidMutationCoordinator',
      ['whenIdle', 'completeFailedIntent'],
    );
    mutations.whenIdle.and.resolveTo();
    const taskAccess = jasmine.createSpyObj<SolidTaskAccessService>(
      'SolidTaskAccessService',
      ['clear', 'scheduleExternalPermissionChecks'],
    );
    taskAccess.scheduleExternalPermissionChecks.and.resolveTo();
    const identities = jasmine.createSpyObj<SolidThingIdentityRegistry>(
      'SolidThingIdentityRegistry',
      ['clear'],
    );
    const access = jasmine.createSpyObj<SolidContainerAccessService>(
      'SolidContainerAccessService',
      ['check'],
    );
    access.check.and.resolveTo({ state: 'writable' });
    const intents = jasmine.createSpyObj<SolidMutationIntentRegistry>(
      'SolidMutationIntentRegistry',
      ['latest', 'clear'],
    );
    intents.latest.and.returnValue(null);

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidRuntimeService, useValue: runtimeService },
        { provide: SolidDiscoverySessionRegistryService, useValue: sessions },
        { provide: SolidTaskHydrationService, useValue: hydration },
        { provide: SolidDataLayerStateService, useValue: dataLayerState },
        { provide: SolidMutationCoordinator, useValue: mutations },
        { provide: SolidTaskAccessService, useValue: taskAccess },
        { provide: SolidThingIdentityRegistry, useValue: identities },
        { provide: SolidContainerAccessService, useValue: access },
        { provide: SolidMutationIntentRegistry, useValue: intents },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('provisions and restores durable sessions before publishing refreshed data', async () => {
    await TestBed.inject(SolidPodRefreshCoordinatorService).start();
    expect(runtimeService.ensureAppContainers).toHaveBeenCalledTimes(1);
    expect(sessions.initialize).toHaveBeenCalledWith(
      layout as never,
      webId,
      jasmine.any(Function),
    );
    expect(sessions.runStartupPass).toHaveBeenCalledTimes(1);
    expect(hydration.reconcileStore).toHaveBeenCalledTimes(1);
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('ready');
  });

  it('refreshes every stable session before a manual run', async () => {
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    await service.refreshNow();
    expect(sessions.refreshAndRun).toHaveBeenCalledTimes(1);
  });

  it('uses targeted runtime refresh for rejected mutation recovery', async () => {
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    await service.recoverRejectedMutation(
      {
        action: {},
        containerKeys: ['tasks'],
        resourceUris: ['https://pod.example/super-productivity/tasks/one.ttl'],
        projection: null,
      } as never,
      new Error('conflict'),
      'task',
    );
    expect(discovery.refresh).toHaveBeenCalledWith({
      uris: ['https://pod.example/super-productivity/tasks/one.ttl'],
    });
  });
});
