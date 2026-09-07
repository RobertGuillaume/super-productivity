import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { OperationLogHydratorService } from '../../op-log/persistence/operation-log-hydrator.service';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from '../../solid-data/solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from '../../solid-data/solid-data-layer-state.service';
import { SolidPodRefreshCoordinatorService } from '../../solid-data/solid-pod-refresh-coordinator.service';
import { SolidStartupService } from '../../solid-data/solid-startup.service';
import { SolidTaskHydrationService } from '../../solid-data/solid-task-hydration.service';
import { allDataWasLoaded } from '../../root-store/meta/all-data-was-loaded.actions';
import { DataInitStateService } from './data-init-state.service';
import { DataInitService } from './data-init.service';

describe('DataInitService Solid startup', () => {
  let store: jasmine.SpyObj<Store>;
  let operationLogHydrator: jasmine.SpyObj<OperationLogHydratorService>;
  let solidStartup: jasmine.SpyObj<SolidStartupService>;
  let solidHydration: jasmine.SpyObj<SolidTaskHydrationService>;
  let refreshCoordinator: jasmine.SpyObj<SolidPodRefreshCoordinatorService>;
  let dataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;

  beforeEach(() => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
    store = jasmine.createSpyObj<Store>('Store', ['dispatch']);
    operationLogHydrator = jasmine.createSpyObj<OperationLogHydratorService>(
      'OperationLogHydratorService',
      ['hydrateStore'],
    );
    solidStartup = jasmine.createSpyObj<SolidStartupService>('SolidStartupService', [
      'bootIfEnabled',
    ]);
    solidHydration = jasmine.createSpyObj<SolidTaskHydrationService>(
      'SolidTaskHydrationService',
      ['hydrateStore'],
    );
    refreshCoordinator = jasmine.createSpyObj<SolidPodRefreshCoordinatorService>(
      'SolidPodRefreshCoordinatorService',
      ['start'],
    );
    dataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['setPhase', 'addDiagnostics'],
    );
    solidStartup.bootIfEnabled.and.resolveTo({ status: 'anonymous' });
    solidHydration.hydrateStore.and.resolveTo({} as never);
    refreshCoordinator.start.and.resolveTo();
    operationLogHydrator.hydrateStore.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: OperationLogHydratorService, useValue: operationLogHydrator },
        { provide: SolidStartupService, useValue: solidStartup },
        { provide: SolidTaskHydrationService, useValue: solidHydration },
        { provide: SolidPodRefreshCoordinatorService, useValue: refreshCoordinator },
        { provide: SolidDataLayerStateService, useValue: dataLayerState },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('hydrates the Solid catalog and completes app initialization while signed out', async () => {
    TestBed.inject(DataInitService);

    await expectAsync(
      firstValueFrom(TestBed.inject(DataInitStateService).isAllDataLoadedInitially$),
    ).toBeResolvedTo(true);
    expect(solidHydration.hydrateStore).toHaveBeenCalledTimes(1);
    expect(operationLogHydrator.hydrateStore).not.toHaveBeenCalled();
    expect(refreshCoordinator.start).not.toHaveBeenCalled();
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('sign-in-required');
    expect(store.dispatch).toHaveBeenCalledWith(allDataWasLoaded());
  });

  it('still completes app initialization when runtime boot fails', async () => {
    solidStartup.bootIfEnabled.and.rejectWith(new Error('runtime unavailable'));
    TestBed.inject(DataInitService);

    await expectAsync(
      firstValueFrom(TestBed.inject(DataInitStateService).isAllDataLoadedInitially$),
    ).toBeResolvedTo(true);
    expect(solidHydration.hydrateStore).toHaveBeenCalledTimes(1);
    expect(operationLogHydrator.hydrateStore).not.toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledWith(allDataWasLoaded());
  });
});
