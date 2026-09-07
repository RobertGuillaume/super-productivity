import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import { WorkContextType } from '../features/work-context/work-context.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTaskPersistenceEffects } from './solid-task-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Persist me to Solid',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['createTask', 'deleteTask', 'updateTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
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

  it('persists task creates to Solid when the Solid data layer owns the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.createTask.and.resolveTo(task);
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskCreate$.subscribe();

    actions$.next(createAddTaskAction());
    await Promise.resolve();

    expect(solidTaskRepository.createTask).toHaveBeenCalledOnceWith(task);
    expect(snackService.open).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores task creates when the Solid data layer does not own the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskCreate$.subscribe();

    actions$.next(createAddTaskAction());
    await Promise.resolve();

    expect(solidTaskRepository.createTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists task updates to Solid with the full post-reducer task', async () => {
    const updatedTask: Task = {
      ...task,
      title: 'Updated in store',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.updateTask.and.resolveTo(updatedTask);
    store.select.and.returnValue(of([updatedTask]));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskUpdate$.subscribe();

    actions$.next(
      TaskSharedActions.updateTask({
        task: {
          id: task.id,
          changes: {
            title: updatedTask.title,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select).toHaveBeenCalledTimes(1);
    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1'],
      },
    ]);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledOnceWith(updatedTask);
    subscription.unsubscribe();
  });

  it('persists task completion with the post-reducer completion fields', async () => {
    const completedTask: Task = {
      ...task,
      isDone: true,
      doneOn: 1710000005000,
      modified: 1710000005000,
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.updateTask.and.resolveTo(completedTask);
    store.select.and.returnValue(of([completedTask]));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskUpdate$.subscribe();

    actions$.next(
      TaskSharedActions.updateTask({
        task: {
          id: task.id,
          changes: {
            isDone: true,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(solidTaskRepository.updateTask).toHaveBeenCalledOnceWith(completedTask);
    subscription.unsubscribe();
  });

  it('persists bulk task updates to Solid', async () => {
    const secondTask: Task = {
      ...task,
      id: 'task-2',
      title: 'Second task',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.updateTask.and.resolveTo(task);
    store.select.and.returnValue(of([task, secondTask]));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskUpdate$.subscribe();

    actions$.next(
      TaskSharedActions.updateTasks({
        tasks: [
          {
            id: 'task-1',
            changes: {
              isDone: true,
            },
          },
          {
            id: 'task-2',
            changes: {
              title: 'Second task',
            },
          },
        ],
      }),
    );
    await Promise.resolve();

    expect(store.select).toHaveBeenCalledTimes(1);
    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1', 'task-2'],
      },
    ]);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledWith(task);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledWith(secondTask);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('persists task tag membership with the full post-reducer task', async () => {
    const taggedTask: Task = {
      ...task,
      tagIds: ['tag-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.updateTask.and.resolveTo(taggedTask);
    store.select.and.returnValue(of([taggedTask]));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskUpdate$.subscribe();

    actions$.next(
      TaskSharedActions.addTagToTask({
        taskId: 'task-1',
        tagId: 'tag-1',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTasksById,
      {
        ids: ['task-1'],
      },
    ]);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledOnceWith(taggedTask);
    subscription.unsubscribe();
  });

  it('persists all post-reducer tasks after bulk tag removal', async () => {
    const firstTask: Task = {
      ...task,
      tagIds: [],
    };
    const secondTask: Task = {
      ...task,
      id: 'task-2',
      title: 'Second task',
      tagIds: ['tag-2'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.updateTask.and.resolveTo(firstTask);
    store.select.and.returnValue(of([firstTask, secondTask]));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistBulkTagRemoval$.subscribe();

    actions$.next(
      TaskSharedActions.removeTagsForAllTasks({
        tagIdsToRemove: ['tag-1'],
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([selectAllTasks]);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledWith(firstTask);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledWith(secondTask);
    expect(solidTaskRepository.updateTask).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('ignores remote bulk tag removal actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistBulkTagRemoval$.subscribe();

    actions$.next({
      ...TaskSharedActions.removeTagsForAllTasks({
        tagIdsToRemove: ['tag-1'],
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.updateTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('surfaces Solid persistence failures', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.createTask.and.rejectWith(new Error('write failed'));
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskCreate$.subscribe();

    actions$.next(createAddTaskAction());
    await Promise.resolve();
    await Promise.resolve();

    expect(snackService.open).toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists single task deletes and their subtasks to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.deleteTask.and.resolveTo();
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskDelete$.subscribe();

    actions$.next(createDeleteTaskAction());
    await Promise.resolve();

    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('task-1');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('sub-task-1');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('persists bulk task deletes to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.deleteTask.and.resolveTo();
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskDelete$.subscribe();

    actions$.next(TaskSharedActions.deleteTasks({ taskIds: ['task-1', 'task-2'] }));
    await Promise.resolve();

    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('task-1');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('task-2');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  const createAddTaskAction = (): ReturnType<typeof TaskSharedActions.addTask> =>
    TaskSharedActions.addTask({
      task,
      workContextId: INBOX_PROJECT.id,
      workContextType: WorkContextType.PROJECT,
      isAddToBacklog: false,
      isAddToBottom: false,
    });

  const createDeleteTaskAction = (): ReturnType<typeof TaskSharedActions.deleteTask> =>
    TaskSharedActions.deleteTask({
      task: {
        ...task,
        subTasks: [
          {
            ...DEFAULT_TASK,
            id: 'sub-task-1',
            title: 'Subtask',
            projectId: INBOX_PROJECT.id,
            created: 1710000000100,
          },
        ],
      },
    });
});
