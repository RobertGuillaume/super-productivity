import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { syncTimeSpent } from '../features/time-tracking/store/time-tracking.actions';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import {
  moveSubTask,
  roundTimeSpentForDay,
  updateTaskUi,
} from '../features/tasks/store/task.actions';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidEmbeddedTaskPersistenceEffects } from './solid-embedded-task-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidEmbeddedTaskPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'project-1',
    created: 1710000000000,
  };
  const parentTask: Task = {
    ...task,
    id: 'parent-1',
    subTaskIds: ['task-1'],
  };
  const targetParentTask: Task = {
    ...task,
    id: 'target-parent-1',
    subTaskIds: [],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidEmbeddedTaskPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
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

  it('persists single embedded task updates from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    store.select.and.returnValue(of([task]));
    const effects = TestBed.inject(SolidEmbeddedTaskPersistenceEffects);
    const subscription = effects.persistEmbeddedTaskWrite$.subscribe();

    actions$.next(
      updateTaskUi({
        task: {
          id: 'task-1',
          changes: {
            _hideSubTasksMode: 1,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectTasksById, { ids: ['task-1'] }],
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    subscription.unsubscribe();
  });

  it('persists all tasks affected by subtask moves', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    store.select.and.returnValue(of([task, parentTask, targetParentTask]));
    const effects = TestBed.inject(SolidEmbeddedTaskPersistenceEffects);
    const subscription = effects.persistEmbeddedTaskWrite$.subscribe();

    actions$.next(
      moveSubTask({
        taskId: 'task-1',
        srcTaskId: 'parent-1',
        targetTaskId: 'target-parent-1',
        afterTaskId: null,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectTasksById, { ids: ['task-1', 'parent-1', 'target-parent-1'] }],
    ]);
    expect(solidTaskRepository.saveTask.calls.allArgs()).toEqual([
      [task],
      [parentTask],
      [targetParentTask],
    ]);
    subscription.unsubscribe();
  });

  it('persists post-reducer tasks broadly after day rounding recalculates parents', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    store.select.and.returnValue(of([task, parentTask]));
    const effects = TestBed.inject(SolidEmbeddedTaskPersistenceEffects);
    const subscription = effects.persistEmbeddedTaskWrite$.subscribe();

    actions$.next(
      roundTimeSpentForDay({
        day: '2026-08-03',
        taskIds: ['task-1'],
        roundTo: 'QUARTER',
        isRoundUp: true,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectAllTasks],
    ]);
    expect(solidTaskRepository.saveTask.calls.allArgs()).toEqual([[task], [parentTask]]);
    subscription.unsubscribe();
  });

  it('ignores remote embedded task actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidEmbeddedTaskPersistenceEffects);
    const subscription = effects.persistEmbeddedTaskWrite$.subscribe();

    actions$.next({
      ...syncTimeSpent({
        taskId: 'task-1',
        date: '2026-08-03',
        duration: 1000,
      }),
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
