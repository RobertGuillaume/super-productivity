import { Action, ActionReducer } from '@ngrx/store';
import { TASK_FEATURE_NAME } from '../features/tasks/store/task.reducer';
import { TaskState } from '../features/tasks/task.model';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { solidCatalogReconciled } from './solid-catalog-reconciled.action';

type StateWithTasks = Record<string, unknown> & {
  [TASK_FEATURE_NAME]?: TaskState;
};

/**
 * Applies a refreshed Solid catalog using the reducers' existing replacement logic,
 * without exposing a second `loadAllData` action to effects.
 */
export const solidCatalogReconciliationMetaReducer = <T>(
  reducer: ActionReducer<T>,
): ActionReducer<T> => {
  return (state: T | undefined, action: Action): T => {
    if (action.type !== solidCatalogReconciled.type) {
      return reducer(state, action);
    }
    const reconciliationAction = action as ReturnType<typeof solidCatalogReconciled>;

    const reconciled = reducer(
      state,
      loadAllData({ appDataComplete: reconciliationAction.appDataComplete }),
    );
    if (state === undefined) {
      return reconciled;
    }

    const previousTasks = (state as StateWithTasks)[TASK_FEATURE_NAME];
    const nextTasks = (reconciled as StateWithTasks)[TASK_FEATURE_NAME];
    if (previousTasks === undefined || nextTasks === undefined) {
      return reconciled;
    }

    const exists = (taskId: string | null): boolean =>
      taskId !== null && nextTasks.entities[taskId] !== undefined;
    const tasksWithPreservedUiState: TaskState = {
      ...nextTasks,
      currentTaskId: exists(previousTasks.currentTaskId)
        ? previousTasks.currentTaskId
        : null,
      selectedTaskId: exists(previousTasks.selectedTaskId)
        ? previousTasks.selectedTaskId
        : null,
      lastCurrentTaskId: exists(previousTasks.lastCurrentTaskId)
        ? previousTasks.lastCurrentTaskId
        : null,
    };

    return {
      ...(reconciled as StateWithTasks),
      [TASK_FEATURE_NAME]: tasksWithPreservedUiState,
    } as T;
  };
};
