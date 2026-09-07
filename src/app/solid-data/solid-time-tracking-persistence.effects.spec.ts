import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import {
  syncTimeTracking,
  updateWorkContextData,
} from '../features/time-tracking/store/time-tracking.actions';
import { selectTimeTrackingState } from '../features/time-tracking/store/time-tracking.selectors';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { timeTrackingEntryId } from './solid-time-tracking.mapper';
import { SolidTimeTrackingPersistenceEffects } from './solid-time-tracking-persistence.effects';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';

describe('SolidTimeTrackingPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTimeTrackingRepository: jasmine.SpyObj<SolidTimeTrackingRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const state: TimeTrackingState = {
    project: {
      ['project-1']: {
        ['2026-08-04']: {
          s: 1710000000000,
          e: 1710003600000,
          b: 1,
        },
      },
    },
    tag: {
      ['tag-1']: {
        ['2026-08-04']: {
          s: 1710000500000,
          e: 1710004100000,
        },
      },
    },
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTimeTrackingRepository = jasmine.createSpyObj<SolidTimeTrackingRepository>(
      'SolidTimeTrackingRepository',
      ['saveTimeTrackingEntry'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTimeTrackingPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidTimeTrackingRepository, useValue: solidTimeTrackingRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists work context data updates from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTimeTrackingRepository.saveTimeTrackingEntry.and.callFake(
      async (entry) => entry,
    );
    store.select.and.callFake((selector) =>
      selector === selectTimeTrackingState ? of(state) : of(null),
    );
    const effects = TestBed.inject(SolidTimeTrackingPersistenceEffects);
    const subscription = effects.persistTimeTracking$.subscribe();

    actions$.next(
      updateWorkContextData({
        ctx: {
          id: 'project-1',
          type: WorkContextType.PROJECT,
        },
        date: '2026-08-04',
        updates: {
          e: 1,
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectTimeTrackingState],
    ]);
    expect(solidTimeTrackingRepository.saveTimeTrackingEntry).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        id: timeTrackingEntryId('PROJECT', 'project-1', '2026-08-04'),
        contextType: 'PROJECT',
        contextId: 'project-1',
        date: '2026-08-04',
        data: state.project['project-1']['2026-08-04'],
      }),
    );
    subscription.unsubscribe();
  });

  it('persists synced time tracking from selected local state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTimeTrackingRepository.saveTimeTrackingEntry.and.callFake(
      async (entry) => entry,
    );
    store.select.and.returnValue(of(state));
    const effects = TestBed.inject(SolidTimeTrackingPersistenceEffects);
    const subscription = effects.persistTimeTracking$.subscribe();

    actions$.next(
      syncTimeTracking({
        contextType: 'TAG',
        contextId: 'tag-1',
        date: '2026-08-04',
        data: {
          e: 1,
        },
      }),
    );
    await Promise.resolve();

    expect(solidTimeTrackingRepository.saveTimeTrackingEntry).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        id: timeTrackingEntryId('TAG', 'tag-1', '2026-08-04'),
        data: state.tag['tag-1']['2026-08-04'],
      }),
    );
    subscription.unsubscribe();
  });

  it('skips missing post-reducer entries', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    store.select.and.returnValue(of(state));
    const effects = TestBed.inject(SolidTimeTrackingPersistenceEffects);
    const subscription = effects.persistTimeTracking$.subscribe();

    actions$.next(
      syncTimeTracking({
        contextType: 'PROJECT',
        contextId: 'missing-project',
        date: '2026-08-04',
        data: {
          e: 1,
        },
      }),
    );
    await Promise.resolve();

    expect(solidTimeTrackingRepository.saveTimeTrackingEntry).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote time tracking actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTimeTrackingPersistenceEffects);
    const subscription = effects.persistTimeTracking$.subscribe();

    actions$.next({
      ...syncTimeTracking({
        contextType: 'PROJECT',
        contextId: 'project-1',
        date: '2026-08-04',
        data: state.project['project-1']['2026-08-04'],
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTimeTrackingRepository.saveTimeTrackingEntry).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
