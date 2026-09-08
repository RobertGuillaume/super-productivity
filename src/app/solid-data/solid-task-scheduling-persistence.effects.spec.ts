import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { lastValueFrom, of, Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskSchedulingPersistenceEffects } from './solid-task-scheduling-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskSchedulingPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'project-1',
    dueWithTime: 1710000000000,
    remindAt: 1710000000000,
    created: 1710000000000,
  };
  const todayTag: Tag = {
    ...TODAY_TAG,
    taskIds: ['task-1'],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskSchedulingPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidTagRepository, useValue: solidTagRepository },
        { provide: SolidTaskRepository, useValue: solidTaskRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists scheduled tasks and Today tag from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.callFake((selector) => {
      if (selector === selectTasksById) {
        return of([task]);
      }
      if (selector === selectTagById) {
        return of(todayTag);
      }
      return of([]);
    });
    const effects = TestBed.inject(SolidTaskSchedulingPersistenceEffects);
    const persistenceComplete = lastValueFrom(
      effects.persistTaskScheduling$.pipe(take(1)),
    );

    actions$.next(
      TaskSharedActions.scheduleTaskWithTime({
        task: {
          ...task,
          dueWithTime: undefined,
          remindAt: undefined,
        },
        dueWithTime: 1710000000000,
        remindAt: 1710000000000,
        isMoveToBacklog: false,
      }),
    );
    await persistenceComplete;

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [
        selectTasksById,
        {
          ids: ['task-1'],
        },
      ],
      [
        selectTagById,
        {
          id: TODAY_TAG.id,
        },
      ],
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(todayTag);
  });

  it('uses the action id for unschedule and dismiss reminder actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.callFake((selector) =>
      selector === selectTasksById ? of([task]) : of(todayTag),
    );
    const effects = TestBed.inject(SolidTaskSchedulingPersistenceEffects);
    const persistenceComplete = lastValueFrom(
      effects.persistTaskScheduling$.pipe(take(2)),
    );

    actions$.next(TaskSharedActions.unscheduleTask({ id: 'task-1' }));
    actions$.next(TaskSharedActions.dismissReminderOnly({ id: 'task-1' }));
    await persistenceComplete;

    expect(store.select.calls.allArgs()[0] as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1'],
      },
    ]);
    expect(store.select.calls.allArgs()[2] as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1'],
      },
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledTimes(2);
    expect(solidTagRepository.saveTag).toHaveBeenCalledTimes(2);
  });

  it('ignores scheduling actions when Solid does not own them', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskSchedulingPersistenceEffects);
    const subscription = effects.persistTaskScheduling$.subscribe();

    actions$.next(TaskSharedActions.unscheduleTask({ id: 'task-1' }));
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote scheduling actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskSchedulingPersistenceEffects);
    const subscription = effects.persistTaskScheduling$.subscribe();

    actions$.next({
      ...TaskSharedActions.dismissReminderOnly({ id: 'task-1' }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
