import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { Log } from '../core/log';
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
  let access: jasmine.SpyObj<SolidContainerAccessService>;

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
    runtimeService.resolveAuthenticatedStorageRoot.and.resolveTo({
      status: 'trusted-live',
      changed: false,
      storageRoot: 'https://pod.example/',
      webId,
    });
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
      ['reconcileStore', 'resetCatalogBaseline', 'hasDegradedState'],
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
        'setRuntimeBinding',
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
    access = jasmine.createSpyObj<SolidContainerAccessService>(
      'SolidContainerAccessService',
      ['check'],
    );
    access.check.and.resolveTo({ state: 'writable' });
    const intents = jasmine.createSpyObj<SolidMutationIntentRegistry>(
      'SolidMutationIntentRegistry',
      ['clear', 'isCurrent'],
    );
    intents.isCurrent.and.returnValue(true);

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

  it('restores durable sessions before publishing refreshed data', async () => {
    await TestBed.inject(SolidPodRefreshCoordinatorService).start();
    expect(dataLayerState.setRuntimeBinding).toHaveBeenCalledWith({
      status: 'trusted-live',
      generation: 0,
      storageRoot: 'https://pod.example/',
      webId,
    });
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
        runtimeGeneration: 0,
        storageRoot: 'https://pod.example/',
        webId,
      } as never,
      new Error('conflict'),
      'task',
    );
    expect(discovery.refresh).toHaveBeenCalledWith({
      uris: ['https://pod.example/super-productivity/tasks/one.ttl'],
    });
  });

  it('reinitializes the full registry after a failed startup on manual refresh', async () => {
    sessions.runStartupPass.and.rejectWith(catalogFailure('unavailable'));
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);

    await service.start();

    expect(access.check).not.toHaveBeenCalled();
    expect(dataLayerState.clearWriteReadiness).toHaveBeenCalled();
    sessions.runStartupPass.and.resolveTo();

    await service.refreshNow();

    expect(sessions.pause).toHaveBeenCalledTimes(2);
    expect(sessions.initialize).toHaveBeenCalledTimes(2);
    expect(access.check).toHaveBeenCalledTimes(2);
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('ready');
  });

  it('reinitializes the full registry after a failed startup when coming online', async () => {
    sessions.runStartupPass.and.rejectWith(catalogFailure('unavailable'));
    const service = TestBed.inject(SolidPodRefreshCoordinatorService);
    await service.start();
    sessions.runStartupPass.and.resolveTo();

    window.dispatchEvent(new Event('online'));
    await drainMicrotasks();

    expect(sessions.pause).toHaveBeenCalledTimes(2);
    expect(sessions.initialize).toHaveBeenCalledTimes(2);
    expect(access.check).toHaveBeenCalledTimes(2);
  });

  it('retries a coordination failure once after the ownership window', async () => {
    jasmine.clock().install();
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    sessions.runStartupPass.and.rejectWith(catalogFailure('conflict'));
    try {
      await TestBed.inject(SolidPodRefreshCoordinatorService).start();
      sessions.runStartupPass.and.resolveTo();

      jasmine.clock().tick(29_999);
      await drainMicrotasks();
      expect(sessions.initialize).toHaveBeenCalledTimes(1);

      jasmine.clock().tick(1);
      await drainMicrotasks();
      expect(sessions.initialize).toHaveBeenCalledTimes(2);

      jasmine.clock().tick(30_000);
      await drainMicrotasks();
      expect(sessions.initialize).toHaveBeenCalledTimes(2);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('logs only structured content-safe startup failure data', async () => {
    const logSpy = spyOn(Log, 'err');
    sessions.runStartupPass.and.rejectWith(
      catalogFailure(
        'corrupt-store',
        new DOMException('https://private.example/TODAY.ttl#it', 'DataError'),
      ),
    );

    await TestBed.inject(SolidPodRefreshCoordinatorService).start();

    expect(logSpy).toHaveBeenCalledOnceWith('Solid runtime operation failed', {
      operation: 'discovery-startup',
      errorName: 'CatalogPersistenceError',
      catalogKind: 'corrupt-store',
      causeName: 'DataError',
      retryPolicy: 'manual',
    });
    const serialized = JSON.stringify(logSpy.calls.mostRecent().args);
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('TODAY.ttl');
  });
});

const catalogFailure = (
  kind: string,
  cause: unknown = undefined,
): Error & { kind: string; cause: unknown } =>
  Object.assign(new Error('private runtime failure'), {
    name: 'CatalogPersistenceError',
    kind,
    cause,
  });

const drainMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
};
