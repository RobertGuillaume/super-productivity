import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { Metric, MetricState } from '../features/metric/metric.model';
import {
  deleteMetric,
  logFocusSession,
  updateMetric,
} from '../features/metric/store/metric.actions';
import { selectMetricFeatureState } from '../features/metric/store/metric.selectors';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidMetricPersistenceEffects } from './solid-metric-persistence.effects';
import { SolidMetricRepository } from './solid-metric.repository';

describe('SolidMetricPersistenceEffects', () => {
  const metric: Metric = {
    id: '2026-08-04',
    focusSessions: [25],
    notes: 'State metric',
    remindTomorrow: true,
  };
  const metricState: MetricState = {
    ids: [metric.id],
    entities: {
      [metric.id]: metric,
    },
  };

  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidMetricRepository: jasmine.SpyObj<SolidMetricRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidMetricRepository = jasmine.createSpyObj<SolidMetricRepository>(
      'SolidMetricRepository',
      ['saveMetric', 'deleteMetric'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidMetricPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidMetricRepository, useValue: solidMetricRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists metric updates from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMetricRepository.saveMetric.and.resolveTo(metric);
    store.select.and.callFake((selector) =>
      selector === selectMetricFeatureState ? of(metricState) : of([]),
    );
    const effects = TestBed.inject(SolidMetricPersistenceEffects);
    const subscription = effects.persistMetricSave$.subscribe();

    actions$.next(
      updateMetric({
        metric: {
          id: metric.id,
          changes: {
            notes: 'payload should not be used',
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectMetricFeatureState],
    ]);
    expect(solidMetricRepository.saveMetric).toHaveBeenCalledOnceWith(metric);
    subscription.unsubscribe();
  });

  it('persists positive focus sessions from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMetricRepository.saveMetric.and.resolveTo(metric);
    store.select.and.returnValue(of(metricState));
    const effects = TestBed.inject(SolidMetricPersistenceEffects);
    const subscription = effects.persistMetricSave$.subscribe();

    actions$.next(
      logFocusSession({
        day: metric.id,
        duration: 25,
      }),
    );
    await Promise.resolve();

    expect(solidMetricRepository.saveMetric).toHaveBeenCalledOnceWith(metric);
    subscription.unsubscribe();
  });

  it('skips non-positive focus sessions because the reducer has no state change', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidMetricPersistenceEffects);
    const subscription = effects.persistMetricSave$.subscribe();

    actions$.next(
      logFocusSession({
        day: metric.id,
        duration: 0,
      }),
    );
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidMetricRepository.saveMetric).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists metric deletes', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMetricRepository.deleteMetric.and.resolveTo();
    const effects = TestBed.inject(SolidMetricPersistenceEffects);
    const subscription = effects.persistMetricDelete$.subscribe();

    actions$.next(deleteMetric({ id: metric.id }));
    await Promise.resolve();

    expect(solidMetricRepository.deleteMetric).toHaveBeenCalledOnceWith(metric.id);
    subscription.unsubscribe();
  });

  it('ignores remote metric actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidMetricPersistenceEffects);
    const subscription = effects.persistMetricSave$.subscribe();

    actions$.next({
      ...logFocusSession({
        day: metric.id,
        duration: 25,
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidMetricRepository.saveMetric).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
