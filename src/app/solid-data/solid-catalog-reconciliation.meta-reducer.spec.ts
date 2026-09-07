import { Action, ActionReducer } from '@ngrx/store';
import { DEFAULT_TASK, Task, TaskState } from '../features/tasks/task.model';
import {
  initialTaskState,
  TASK_FEATURE_NAME,
} from '../features/tasks/store/task.reducer';
import { taskAdapter } from '../features/tasks/store/task.adapter';
import { AppDataComplete } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { createSolidAppData } from './solid-task-hydration.service';
import { solidCatalogReconciled } from './solid-catalog-reconciled.action';
import { solidCatalogReconciliationMetaReducer } from './solid-catalog-reconciliation.meta-reducer';

interface TestState {
  [TASK_FEATURE_NAME]: TaskState;
}

describe('solidCatalogReconciliationMetaReducer', () => {
  const retainedTask: Task = {
    ...DEFAULT_TASK,
    id: 'retained',
    title: 'Retained',
    created: 1,
    projectId: 'INBOX_PROJECT',
  };

  it('applies loadAllData semantics internally and preserves valid UI pointers', () => {
    const previousTasks = taskAdapter.setAll([retainedTask], {
      ...initialTaskState,
      currentTaskId: retainedTask.id,
      selectedTaskId: retainedTask.id,
      lastCurrentTaskId: 'removed',
    });
    const state: TestState = { [TASK_FEATURE_NAME]: previousTasks };
    const appDataComplete = createSolidAppData({
      tasks: [retainedTask],
      projects: [],
      tags: [],
      notes: [],
    });
    const seenActions: Action[] = [];
    const reducer: ActionReducer<TestState> = (current, action) => {
      seenActions.push(action);
      if (action.type === loadAllData.type) {
        const loadAction = action as ReturnType<typeof loadAllData>;
        return {
          [TASK_FEATURE_NAME]: loadAction.appDataComplete.task as TaskState,
        };
      }
      return current ?? state;
    };

    const result = solidCatalogReconciliationMetaReducer(reducer)(
      state,
      solidCatalogReconciled({ appDataComplete: appDataComplete as AppDataComplete }),
    );

    expect(seenActions.map((action) => action.type)).toEqual([loadAllData.type]);
    expect(result[TASK_FEATURE_NAME].currentTaskId).toBe(retainedTask.id);
    expect(result[TASK_FEATURE_NAME].selectedTaskId).toBe(retainedTask.id);
    expect(result[TASK_FEATURE_NAME].lastCurrentTaskId).toBeNull();
  });
});
