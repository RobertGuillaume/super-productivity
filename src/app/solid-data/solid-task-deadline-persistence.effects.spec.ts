import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
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
import { SolidTaskDeadlinePersistenceEffects } from './solid-task-deadline-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskDeadlinePersistenceEffects', () => {
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
    deadlineDay: '2026-08-03',
    created: 1710000000000,
  };
  const secondTask: Task = {
    ...task,
    id: 'task-2',
  };
  const todayTag: Tag = {
    ...TODAY_TAG,
    taskIds: ['task-2', 'task-1'],
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
        SolidTaskDeadlinePersistenceEffects,
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

  it('persists single-task deadline changes and Today tag', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.callFake((selector) =>
      selector === selectTasksById ? of([task]) : of(todayTag),
    );
    const effects = TestBed.inject(SolidTaskDeadlinePersistenceEffects);
    const subscription = effects.persistTaskDeadlines$.subscribe();

    actions$.next(
      TaskSharedActions.setDeadline({
        taskId: 'task-1',
        deadlineDay: '2026-08-03',
      }),
    );
    await Promise.resolve();

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
    subscription.unsubscribe();
  });

  it('persists planned deadline tasks and Today order', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.callFake((selector) =>
      selector === selectTasksById ? of([task, secondTask]) : of(todayTag),
    );
    const effects = TestBed.inject(SolidTaskDeadlinePersistenceEffects);
    const subscription = effects.persistTaskDeadlines$.subscribe();

    actions$.next(
      TaskSharedActions.planDeadlineTasksForToday({
        taskIds: ['task-1', 'task-2'],
        today: '2026-08-03',
        startOfNextDayDiffMs: 0,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: TODAY_TAG.id,
      },
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledWith(task);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledWith(secondTask);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledTimes(2);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(todayTag);
    subscription.unsubscribe();
  });

  it('ignores deadline actions when Solid does not own them', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskDeadlinePersistenceEffects);
    const subscription = effects.persistTaskDeadlines$.subscribe();

    actions$.next(TaskSharedActions.removeDeadline({ taskId: 'task-1' }));
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote deadline actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskDeadlinePersistenceEffects);
    const subscription = effects.persistTaskDeadlines$.subscribe();

    actions$.next({
      ...TaskSharedActions.clearDeadlineReminder({ taskId: 'task-1' }),
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
