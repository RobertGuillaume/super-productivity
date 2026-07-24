import { TestBed } from '@angular/core/testing';
import { Action } from '@ngrx/store';
import { Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTaskPersistenceEffects } from './solid-task-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
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
      ['deleteTask', 'saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidTaskRepository, useValue: solidTaskRepository },
        { provide: SnackService, useValue: snackService },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists task creates to Solid when the Solid data layer owns the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskCreate$.subscribe();

    actions$.next(createAddTaskAction());
    await Promise.resolve();

    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(snackService.open).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores task creates when the Solid data layer does not own the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskPersistenceEffects);
    const subscription = effects.persistTaskCreate$.subscribe();

    actions$.next(createAddTaskAction());
    await Promise.resolve();

    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('surfaces Solid persistence failures', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.rejectWith(new Error('write failed'));
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
