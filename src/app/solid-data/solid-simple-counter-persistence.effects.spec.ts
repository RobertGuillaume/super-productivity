import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import {
  SimpleCounter,
  SimpleCounterState,
  SimpleCounterType,
} from '../features/simple-counter/simple-counter.model';
import {
  addSimpleCounter,
  deleteSimpleCounters,
  syncSimpleCounterTime,
  updateAllSimpleCounters,
  updateSimpleCounterOrder,
} from '../features/simple-counter/store/simple-counter.actions';
import { selectSimpleCounterFeatureState } from '../features/simple-counter/store/simple-counter.reducer';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidSimpleCounterPersistenceEffects } from './solid-simple-counter-persistence.effects';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';

describe('SolidSimpleCounterPersistenceEffects', () => {
  const TODAY = '2026-08-04';
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidSimpleCounterRepository: jasmine.SpyObj<SolidSimpleCounterRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const simpleCounter: SimpleCounter = {
    id: 'counter-1',
    title: 'State counter',
    isEnabled: true,
    icon: 'timer',
    type: SimpleCounterType.StopWatch,
    countOnDay: {
      [TODAY]: 120000,
    },
    isOn: false,
  };
  const secondSimpleCounter: SimpleCounter = {
    ...simpleCounter,
    id: 'counter-2',
    title: 'Second counter',
  };
  const simpleCounterState: SimpleCounterState = {
    ids: ['counter-1', 'counter-2'],
    entities: {
      [simpleCounter.id]: simpleCounter,
      [secondSimpleCounter.id]: secondSimpleCounter,
    },
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidSimpleCounterRepository = jasmine.createSpyObj<SolidSimpleCounterRepository>(
      'SolidSimpleCounterRepository',
      ['saveSimpleCounter', 'replaceSimpleCounters', 'deleteSimpleCounter'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidSimpleCounterPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        {
          provide: SolidSimpleCounterRepository,
          useValue: solidSimpleCounterRepository,
        },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists added simple counters from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSimpleCounterRepository.saveSimpleCounter.and.resolveTo(simpleCounter);
    store.select.and.callFake((selector) =>
      selector === selectSimpleCounterFeatureState ? of(simpleCounterState) : of([]),
    );
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterSave$.subscribe();

    actions$.next(
      addSimpleCounter({
        simpleCounter: {
          ...simpleCounter,
          title: 'payload should not be used',
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectSimpleCounterFeatureState],
    ]);
    expect(solidSimpleCounterRepository.saveSimpleCounter).toHaveBeenCalledOnceWith(
      simpleCounter,
      0,
    );
    subscription.unsubscribe();
  });

  it('replaces all simple counter resources after bulk updates', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSimpleCounterRepository.replaceSimpleCounters.and.resolveTo([
      secondSimpleCounter,
      simpleCounter,
    ]);
    store.select.and.returnValue(
      of({
        ...simpleCounterState,
        ids: ['counter-2', 'counter-1'],
      }),
    );
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterSave$.subscribe();

    actions$.next(
      updateAllSimpleCounters({
        items: [
          {
            ...simpleCounter,
            title: 'payload should not be used',
          },
        ],
      }),
    );
    await Promise.resolve();

    expect(solidSimpleCounterRepository.replaceSimpleCounters).toHaveBeenCalledOnceWith([
      secondSimpleCounter,
      simpleCounter,
    ]);
    expect(solidSimpleCounterRepository.saveSimpleCounter).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists order changes with post-reducer order indexes', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSimpleCounterRepository.saveSimpleCounter.and.resolveTo(simpleCounter);
    store.select.and.returnValue(
      of({
        ...simpleCounterState,
        ids: ['counter-2', 'counter-1'],
      }),
    );
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterSave$.subscribe();

    actions$.next(updateSimpleCounterOrder({ ids: ['counter-2', 'counter-1'] }));
    await Promise.resolve();

    expect(solidSimpleCounterRepository.saveSimpleCounter.calls.allArgs()).toEqual([
      [secondSimpleCounter, 0],
      [simpleCounter, 1],
    ]);
    subscription.unsubscribe();
  });

  it('persists local stopwatch sync from the current counter state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSimpleCounterRepository.saveSimpleCounter.and.resolveTo(simpleCounter);
    store.select.and.returnValue(of(simpleCounterState));
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterSave$.subscribe();

    actions$.next(
      syncSimpleCounterTime({
        id: 'counter-1',
        date: TODAY,
        duration: 60000,
      }),
    );
    await Promise.resolve();

    expect(solidSimpleCounterRepository.saveSimpleCounter).toHaveBeenCalledOnceWith(
      simpleCounter,
      0,
    );
    subscription.unsubscribe();
  });

  it('persists bulk simple counter deletes', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSimpleCounterRepository.deleteSimpleCounter.and.resolveTo();
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterDelete$.subscribe();

    actions$.next(deleteSimpleCounters({ ids: ['counter-1', 'counter-2'] }));
    await Promise.resolve();

    expect(solidSimpleCounterRepository.deleteSimpleCounter.calls.allArgs()).toEqual([
      ['counter-1'],
      ['counter-2'],
    ]);
    subscription.unsubscribe();
  });

  it('ignores remote simple counter actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidSimpleCounterPersistenceEffects);
    const subscription = effects.persistSimpleCounterSave$.subscribe();

    actions$.next({
      ...syncSimpleCounterTime({
        id: 'counter-1',
        date: TODAY,
        duration: 60000,
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidSimpleCounterRepository.saveSimpleCounter).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
