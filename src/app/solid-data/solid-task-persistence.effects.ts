import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidTaskTagBulkRemovalAction,
  SolidTaskTagMembershipAction,
  SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES,
} from './solid-task-tag-action-types';
import { SolidTaskRepository } from './solid-task.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';

type SolidTaskUpdateAction =
  | ReturnType<typeof TaskSharedActions.updateTask>
  | ReturnType<typeof TaskSharedActions.updateTasks>
  | SolidTaskTagMembershipAction;

@Injectable()
export class SolidTaskPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
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
          from(this.solidTaskRepository.createTask(action.task)).pipe(
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
          (action): action is SolidTaskUpdateAction & PersistentAction =>
            isSolidTaskUpdateAction(action) &&
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
                  settleSolidMutations(
                    tasks.map((task) => this.solidTaskRepository.updateTask(task)),
                  ),
                ),
              ),
              catchError((error) => this.handlePersistenceError(error)),
            ),
        ),
      ),
    { dispatch: false },
  );

  persistBulkTagRemoval$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is PersistentAction =>
            isSolidTaskTagBulkRemovalAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.store.select(selectAllTasks).pipe(
            take(1),
            concatMap((tasks) =>
              from(
                settleSolidMutations(
                  tasks.map((task) => this.solidTaskRepository.updateTask(task)),
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

    await settleSolidMutations(
      taskIds.map((taskId) => this.solidTaskRepository.deleteTask(taskId)),
    );
  }

  private taskIdsForUpdateAction(action: SolidTaskUpdateAction): string[] {
    if (action.type === ActionType.TASK_SHARED_UPDATE_MULTIPLE) {
      return action.tasks.map((task) => task.id as string);
    }

    if (action.type === ActionType.TASK_SHARED_ADD_TAG) {
      return [action.taskId];
    }

    return Array.from(
      new Set([action.task.id as string, ...(action.projectMoveSubTaskIds ?? [])]),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidTaskPersistenceEffects: failed to persist task change',
    });
  }
}

const SOLID_TASK_UPDATE_ACTION_TYPES = new Set<string>([
  ActionType.TASK_SHARED_UPDATE,
  ActionType.TASK_SHARED_UPDATE_MULTIPLE,
  ...SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES,
]);

const isSolidTaskUpdateAction = (action: unknown): action is SolidTaskUpdateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_UPDATE_ACTION_TYPES.has((action as { type: string }).type);
