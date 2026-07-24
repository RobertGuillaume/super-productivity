import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTodayPersistenceEffects } from './solid-today-persistence.effects';

describe('SolidTodayPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
    dueDay: '2026-07-24',
  };
  const todayTag: Tag = {
    ...DEFAULT_TAG,
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
        SolidTodayPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
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

  it('persists planned Today tasks and the Today tag from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.callFake((selector) =>
      selector === selectTasksById ? of([task]) : of(todayTag),
    );
    const effects = TestBed.inject(SolidTodayPersistenceEffects);
    const subscription = effects.persistPlanTasksForToday$.subscribe();

    actions$.next(
      TaskSharedActions.planTasksForToday({
        taskIds: ['task-1'],
        today: '2026-07-24',
        startOfNextDayDiffMs: 0,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.argsFor(0) as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1'],
      },
    ]);
    expect(store.select.calls.argsFor(1) as unknown[]).toEqual([
      selectTagById,
      {
        id: TODAY_TAG.id,
      },
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(todayTag);
    subscription.unsubscribe();
  });

  it('persists Today tag order removals without saving tasks', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(todayTag);
    store.select.and.returnValue(of(todayTag));
    const effects = TestBed.inject(SolidTodayPersistenceEffects);
    const subscription = effects.persistTodayTagOrder$.subscribe();

    actions$.next(TaskSharedActions.removeTasksFromTodayTag({ taskIds: ['task-1'] }));
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: TODAY_TAG.id,
      },
    ]);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(todayTag);
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores Today actions when the Solid data layer does not own them', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTodayPersistenceEffects);
    const subscription = effects.persistTodayTagOrder$.subscribe();

    actions$.next(TaskSharedActions.removeTasksFromTodayTag({ taskIds: ['task-1'] }));
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTagRepository.saveTag).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
