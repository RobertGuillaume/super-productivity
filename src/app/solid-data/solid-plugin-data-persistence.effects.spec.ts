import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import {
  deletePluginMetadata,
  deletePluginUserData,
  upsertPluginMetadata,
  upsertPluginUserData,
} from '../plugins/store/plugin.actions';
import { selectPluginMetadataFeatureState } from '../plugins/store/plugin-metadata.reducer';
import { selectPluginUserDataFeatureState } from '../plugins/store/plugin-user-data.reducer';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidPluginDataPersistenceEffects } from './solid-plugin-data-persistence.effects';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';

describe('SolidPluginDataPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidPluginDataRepository: jasmine.SpyObj<SolidPluginDataRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const pluginUserData: PluginUserData = {
    id: 'plugin-a:doc-1',
    data: 'post reducer payload',
  };
  const pluginMetadata: PluginMetadata = {
    id: 'plugin-a',
    isEnabled: true,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidPluginDataRepository = jasmine.createSpyObj<SolidPluginDataRepository>(
      'SolidPluginDataRepository',
      [
        'savePluginUserData',
        'savePluginMetadata',
        'deletePluginUserData',
        'deletePluginMetadata',
      ],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidPluginDataPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidPluginDataRepository, useValue: solidPluginDataRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists plugin user data upserts from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidPluginDataRepository.savePluginUserData.and.resolveTo(pluginUserData);
    store.select.and.callFake((selector) =>
      selector === selectPluginUserDataFeatureState ? of([pluginUserData]) : of([]),
    );
    const effects = TestBed.inject(SolidPluginDataPersistenceEffects);
    const subscription = effects.persistPluginDataSave$.subscribe();

    actions$.next(
      upsertPluginUserData({
        pluginUserData: {
          id: pluginUserData.id,
          data: 'payload should not be used',
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectPluginUserDataFeatureState],
    ]);
    expect(solidPluginDataRepository.savePluginUserData).toHaveBeenCalledOnceWith(
      pluginUserData,
    );
    subscription.unsubscribe();
  });

  it('persists plugin metadata upserts from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidPluginDataRepository.savePluginMetadata.and.resolveTo(pluginMetadata);
    store.select.and.callFake((selector) =>
      selector === selectPluginMetadataFeatureState ? of([pluginMetadata]) : of([]),
    );
    const effects = TestBed.inject(SolidPluginDataPersistenceEffects);
    const subscription = effects.persistPluginDataSave$.subscribe();

    actions$.next(
      upsertPluginMetadata({
        pluginMetadata: {
          id: pluginMetadata.id,
          isEnabled: false,
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectPluginMetadataFeatureState],
    ]);
    expect(solidPluginDataRepository.savePluginMetadata).toHaveBeenCalledOnceWith(
      pluginMetadata,
    );
    subscription.unsubscribe();
  });

  it('skips missing post-reducer plugin entries', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    store.select.and.returnValue(of([]));
    const effects = TestBed.inject(SolidPluginDataPersistenceEffects);
    const subscription = effects.persistPluginDataSave$.subscribe();

    actions$.next(upsertPluginUserData({ pluginUserData }));
    await Promise.resolve();

    expect(solidPluginDataRepository.savePluginUserData).not.toHaveBeenCalled();
    expect(solidPluginDataRepository.savePluginMetadata).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists plugin data deletes through runtime delete paths', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidPluginDataRepository.deletePluginUserData.and.resolveTo(undefined);
    solidPluginDataRepository.deletePluginMetadata.and.resolveTo(undefined);
    const effects = TestBed.inject(SolidPluginDataPersistenceEffects);
    const userSubscription = effects.persistPluginDataDelete$.subscribe();

    actions$.next(deletePluginUserData({ pluginId: pluginUserData.id }));
    actions$.next(deletePluginMetadata({ pluginId: pluginMetadata.id }));
    await Promise.resolve();

    expect(solidPluginDataRepository.deletePluginUserData).toHaveBeenCalledOnceWith(
      pluginUserData.id,
    );
    expect(solidPluginDataRepository.deletePluginMetadata).toHaveBeenCalledOnceWith(
      pluginMetadata.id,
    );
    userSubscription.unsubscribe();
  });

  it('ignores remote plugin data actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidPluginDataPersistenceEffects);
    const subscription = effects.persistPluginDataSave$.subscribe();

    actions$.next({
      ...upsertPluginUserData({ pluginUserData }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidPluginDataRepository.savePluginUserData).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
