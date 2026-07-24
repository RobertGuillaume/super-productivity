import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { ActionType, OpType } from '../op-log/core/operation.types';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { WorkContextType } from '../features/work-context/work-context.model';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SOLID_DATA_LAYER_ENABLED_STORAGE_KEY } from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidDataLayerStateService', () => {
  let authState: AuthState;

  beforeEach(() => {
    authState = { status: 'anonymous' };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            client: {
              auth: {
                state: () => authState,
              },
            } as SolidRuntime,
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('is inactive unless the flag is enabled and the runtime is authenticated', () => {
    const service = TestBed.inject(SolidDataLayerStateService);

    expect(service.isActive()).toBe(false);

    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    expect(service.isActive()).toBe(false);

    authState = { status: 'authenticated', webId: 'https://user.example/#me' };
    expect(service.isActive()).toBe(true);
  });

  it('owns Solid-backed task write actions only while active', () => {
    const service = TestBed.inject(SolidDataLayerStateService);
    const task: Task = {
      ...DEFAULT_TASK,
      id: 'task-1',
      projectId: 'project-1',
      created: 1710000000000,
    };
    const action = TaskSharedActions.addTask({
      task,
      workContextId: 'project-1',
      workContextType: WorkContextType.PROJECT,
      isAddToBacklog: false,
      isAddToBottom: false,
    }) as PersistentAction;

    expect(service.ownsPersistentAction(action)).toBe(false);

    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    authState = { status: 'authenticated', webId: 'https://user.example/#me' };

    expect(service.ownsPersistentAction(action)).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: TaskSharedActions.deleteTask.type,
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: TaskSharedActions.deleteTasks.type,
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TASK_SHARED_UPDATE,
        meta: {
          ...action.meta,
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TASK_SHARED_UPDATE_MULTIPLE,
        meta: {
          ...action.meta,
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
  });
});
