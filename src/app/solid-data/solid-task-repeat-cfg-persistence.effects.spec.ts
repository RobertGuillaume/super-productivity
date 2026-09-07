import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
  TaskRepeatCfgState,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import {
  addTaskRepeatCfgToTask,
  deleteTaskRepeatCfg,
  updateTaskRepeatCfgs,
} from '../features/task-repeat-cfg/store/task-repeat-cfg.actions';
import { selectTaskRepeatCfgFeatureState } from '../features/task-repeat-cfg/store/task-repeat-cfg.selectors';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTaskRepeatCfgPersistenceEffects } from './solid-task-repeat-cfg-persistence.effects';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskRepeatCfgPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTaskRepeatCfgRepository: jasmine.SpyObj<SolidTaskRepeatCfgRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const taskRepeatCfg: TaskRepeatCfg = {
    ...DEFAULT_TASK_REPEAT_CFG,
    id: 'repeat-cfg-1',
    projectId: 'project-1',
    title: 'Repeat from state',
    tagIds: ['tag-1'],
  };
  const secondTaskRepeatCfg: TaskRepeatCfg = {
    ...taskRepeatCfg,
    id: 'repeat-cfg-2',
  };
  const taskRepeatCfgState: TaskRepeatCfgState = {
    ids: ['repeat-cfg-1', 'repeat-cfg-2'],
    entities: {
      [taskRepeatCfg.id]: taskRepeatCfg,
      [secondTaskRepeatCfg.id]: secondTaskRepeatCfg,
    },
  };
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'project-1',
    repeatCfgId: 'repeat-cfg-1',
    created: 1710000000000,
  };
  const taskAfterSharedDelete: Task = {
    ...task,
    repeatCfgId: undefined,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTaskRepeatCfgRepository = jasmine.createSpyObj<SolidTaskRepeatCfgRepository>(
      'SolidTaskRepeatCfgRepository',
      ['saveTaskRepeatCfg', 'deleteTaskRepeatCfg'],
    );
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskRepeatCfgPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        {
          provide: SolidTaskRepeatCfgRepository,
          useValue: solidTaskRepeatCfgRepository,
        },
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

  it('persists added repeat configs and the linked task from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepeatCfgRepository.saveTaskRepeatCfg.and.resolveTo(taskRepeatCfg);
    solidTaskRepository.saveTask.and.resolveTo(task);
    store.select.and.callFake((selector) => {
      if (selector === selectTaskRepeatCfgFeatureState) {
        return of(taskRepeatCfgState);
      }
      if (selector === selectTasksById) {
        return of([task]);
      }
      return of([]);
    });
    const effects = TestBed.inject(SolidTaskRepeatCfgPersistenceEffects);
    const subscription = effects.persistTaskRepeatCfgSave$.subscribe();

    actions$.next(
      addTaskRepeatCfgToTask({
        taskId: 'task-1',
        taskRepeatCfg: {
          ...taskRepeatCfg,
          title: 'payload should not be used',
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectTaskRepeatCfgFeatureState],
      [
        selectTasksById,
        {
          ids: ['task-1'],
        },
      ],
    ]);
    expect(solidTaskRepeatCfgRepository.saveTaskRepeatCfg).toHaveBeenCalledOnceWith(
      taskRepeatCfg,
    );
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    subscription.unsubscribe();
  });

  it('persists bulk repeat config updates from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepeatCfgRepository.saveTaskRepeatCfg.and.resolveTo(taskRepeatCfg);
    store.select.and.returnValue(of(taskRepeatCfgState));
    const effects = TestBed.inject(SolidTaskRepeatCfgPersistenceEffects);
    const subscription = effects.persistTaskRepeatCfgSave$.subscribe();

    actions$.next(
      updateTaskRepeatCfgs({
        ids: ['repeat-cfg-1', 'repeat-cfg-2'],
        changes: {
          isPaused: true,
        },
      }),
    );
    await Promise.resolve();

    expect(solidTaskRepeatCfgRepository.saveTaskRepeatCfg.calls.allArgs()).toEqual([
      [taskRepeatCfg],
      [secondTaskRepeatCfg],
    ]);
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('deletes standalone repeat configs without touching tasks', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepeatCfgRepository.deleteTaskRepeatCfg.and.resolveTo();
    const effects = TestBed.inject(SolidTaskRepeatCfgPersistenceEffects);
    const subscription = effects.persistTaskRepeatCfgDelete$.subscribe();

    actions$.next(deleteTaskRepeatCfg({ id: 'repeat-cfg-1' }));
    await Promise.resolve();

    expect(solidTaskRepeatCfgRepository.deleteTaskRepeatCfg).toHaveBeenCalledOnceWith(
      'repeat-cfg-1',
    );
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('deletes shared repeat configs and persists post-reducer tasks', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepeatCfgRepository.deleteTaskRepeatCfg.and.resolveTo();
    solidTaskRepository.saveTask.and.resolveTo(taskAfterSharedDelete);
    store.select.and.callFake((selector) =>
      selector === selectAllTasks ? of([taskAfterSharedDelete]) : of([]),
    );
    const effects = TestBed.inject(SolidTaskRepeatCfgPersistenceEffects);
    const subscription = effects.persistTaskRepeatCfgDelete$.subscribe();

    actions$.next(
      TaskSharedActions.deleteTaskRepeatCfg({
        taskRepeatCfgId: 'repeat-cfg-1',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectAllTasks],
    ]);
    expect(solidTaskRepeatCfgRepository.deleteTaskRepeatCfg).toHaveBeenCalledOnceWith(
      'repeat-cfg-1',
    );
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(taskAfterSharedDelete);
    subscription.unsubscribe();
  });

  it('ignores remote repeat config actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskRepeatCfgPersistenceEffects);
    const subscription = effects.persistTaskRepeatCfgSave$.subscribe();

    actions$.next({
      ...updateTaskRepeatCfgs({
        ids: ['repeat-cfg-1'],
        changes: {
          isPaused: true,
        },
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepeatCfgRepository.saveTaskRepeatCfg).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
