import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { syncTimeSpent } from '../features/time-tracking/store/time-tracking.actions';
import {
  __updateMultipleTaskSimple,
  addSubTask,
  moveSubTask,
  moveSubTaskDown,
  moveSubTaskToBottom,
  moveSubTaskToTop,
  moveSubTaskUp,
  removeTimeSpent,
  roundTimeSpentForDay,
  updateTaskUi,
} from '../features/tasks/store/task.actions';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import {
  addTaskAttachment,
  deleteTaskAttachment,
  updateTaskAttachment,
} from '../features/tasks/task-attachment/task-attachment.actions';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidEmbeddedTaskAction,
  SolidEmbeddedTaskAction,
} from './solid-embedded-task-action-types';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidEmbeddedTaskPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistEmbeddedTaskWrite$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidEmbeddedTaskAction & PersistentAction =>
            isSolidEmbeddedTaskAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) => {
          if (action.type === roundTimeSpentForDay.type) {
            return this.store.select(selectAllTasks).pipe(
              take(1),
              concatMap((tasks) =>
                from(
                  Promise.all(
                    tasks.map((task) => this.solidTaskRepository.saveTask(task)),
                  ),
                ),
              ),
              catchError((error) => this.handlePersistenceError(error)),
            );
          }

          return this.store
            .select(selectTasksById, { ids: this.taskIdsForAction(action) })
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
            );
        }),
      ),
    { dispatch: false },
  );

  private taskIdsForAction(action: SolidEmbeddedTaskAction): string[] {
    if (action.type === __updateMultipleTaskSimple.type) {
      return action.taskUpdates.map((taskUpdate) => taskUpdate.id as string);
    }

    if (action.type === updateTaskUi.type) {
      return [action.task.id as string];
    }

    if (action.type === moveSubTask.type) {
      return Array.from(new Set([action.taskId, action.srcTaskId, action.targetTaskId]));
    }

    if (
      action.type === moveSubTaskUp.type ||
      action.type === moveSubTaskDown.type ||
      action.type === moveSubTaskToTop.type ||
      action.type === moveSubTaskToBottom.type
    ) {
      return [action.parentId];
    }

    if (action.type === addSubTask.type) {
      return [action.task.id, action.parentId];
    }

    if (
      action.type === addTaskAttachment.type ||
      action.type === updateTaskAttachment.type ||
      action.type === deleteTaskAttachment.type
    ) {
      return [action.taskId];
    }

    if (action.type === syncTimeSpent.type) {
      return [action.taskId];
    }

    if (action.type === removeTimeSpent.type) {
      return [action.id];
    }

    return [];
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      source: 'SolidEmbeddedTaskPersistenceEffects: failed to persist task change',
    });
  }
}
