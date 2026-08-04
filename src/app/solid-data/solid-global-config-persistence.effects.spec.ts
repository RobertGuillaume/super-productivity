import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_GLOBAL_CONFIG } from '../features/config/default-global-config.const';
import { updateGlobalConfigSection } from '../features/config/store/global-config.actions';
import { selectConfigFeatureState } from '../features/config/store/global-config.reducer';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidGlobalConfigPersistenceEffects } from './solid-global-config-persistence.effects';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';

describe('SolidGlobalConfigPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidGlobalConfigRepository: jasmine.SpyObj<SolidGlobalConfigRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const config = {
    ...DEFAULT_GLOBAL_CONFIG,
    misc: {
      ...DEFAULT_GLOBAL_CONFIG.misc,
      isDisableAnimations: true,
    },
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidGlobalConfigRepository = jasmine.createSpyObj<SolidGlobalConfigRepository>(
      'SolidGlobalConfigRepository',
      ['saveGlobalConfig'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidGlobalConfigPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidGlobalConfigRepository, useValue: solidGlobalConfigRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists post-reducer global config for local updates', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidGlobalConfigRepository.saveGlobalConfig.and.resolveTo(config);
    store.select.and.callFake((selector) =>
      selector === selectConfigFeatureState ? of(config) : of(null),
    );
    const effects = TestBed.inject(SolidGlobalConfigPersistenceEffects);
    const subscription = effects.persistGlobalConfig$.subscribe();

    actions$.next(
      updateGlobalConfigSection({
        sectionKey: 'misc',
        sectionCfg: {
          isDisableAnimations: false,
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectConfigFeatureState],
    ]);
    expect(solidGlobalConfigRepository.saveGlobalConfig).toHaveBeenCalledOnceWith(config);
    subscription.unsubscribe();
  });

  it('ignores remote global config updates', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidGlobalConfigPersistenceEffects);
    const subscription = effects.persistGlobalConfig$.subscribe();

    actions$.next({
      ...updateGlobalConfigSection({
        sectionKey: 'misc',
        sectionCfg: {
          isDisableAnimations: true,
        },
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidGlobalConfigRepository.saveGlobalConfig).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
