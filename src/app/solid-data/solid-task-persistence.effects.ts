import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTaskPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskCreate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (
            action,
          ): action is ReturnType<typeof TaskSharedActions.addTask> & PersistentAction =>
            action.type === ActionType.TASK_SHARED_ADD &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidTaskRepository.saveTask(action.task)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistTaskUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (
            action,
          ): action is
            | (ReturnType<typeof TaskSharedActions.updateTask> & PersistentAction)
            | (ReturnType<typeof TaskSharedActions.updateTasks> & PersistentAction) =>
            (action.type === ActionType.TASK_SHARED_UPDATE ||
              action.type === ActionType.TASK_SHARED_UPDATE_MULTIPLE) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store
            .select(selectTasksById, { ids: this.taskIdsForUpdateAction(action) })
            .pipe(
              take(1),
              concatMap((tasks) =>
                from(
                  Promise.all(
                    tasks.map((task) => this.solidTaskRepository.saveTask(task)),
                  ),
                ),
              ),
              catchError((error) => this.handlePersistenceError(error)),
            ),
        ),
      ),
    { dispatch: false },
  );

  persistTaskDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (
            action,
          ): action is
            | (ReturnType<typeof TaskSharedActions.deleteTask> & PersistentAction)
            | (ReturnType<typeof TaskSharedActions.deleteTasks> & PersistentAction) =>
            (action.type === ActionType.TASK_SHARED_DELETE ||
              action.type === ActionType.TASK_SHARED_DELETE_MULTIPLE) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.deleteTasksForAction(action)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async deleteTasksForAction(
    action:
      | ReturnType<typeof TaskSharedActions.deleteTask>
      | ReturnType<typeof TaskSharedActions.deleteTasks>,
  ): Promise<void> {
    const taskIds =
      action.type === ActionType.TASK_SHARED_DELETE
        ? [action.task.id, ...action.task.subTasks.map((task) => task.id)]
        : action.taskIds;

    await Promise.all(
      taskIds.map((taskId) => this.solidTaskRepository.deleteTask(taskId)),
    );
  }

  private taskIdsForUpdateAction(
    action:
      | ReturnType<typeof TaskSharedActions.updateTask>
      | ReturnType<typeof TaskSharedActions.updateTasks>,
  ): string[] {
    if (action.type === ActionType.TASK_SHARED_UPDATE_MULTIPLE) {
      return action.tasks.map((task) => task.id as string);
    }

    return Array.from(
      new Set([action.task.id as string, ...(action.projectMoveSubTaskIds ?? [])]),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidTaskPersistenceEffects: failed to persist task change', {
      name: (error as Error | undefined)?.name,
    });
    this.snackService.open({
      type: 'ERROR',
      msg: T.F.SYNC.S.PERSIST_FAILED,
      actionStr: T.PS.RELOAD,
      actionFn: (): void => {
        window.location.reload();
      },
      config: {
        duration: 0,
      },
    });
    return EMPTY;
  }
}
