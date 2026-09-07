import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from, Observable, of } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { TaskRepeatCfg } from '../features/task-repeat-cfg/task-repeat-cfg.model';
import {
  addTaskRepeatCfgToTask,
  deleteTaskRepeatCfg,
  deleteTaskRepeatCfgs,
  updateTaskRepeatCfg,
  updateTaskRepeatCfgs,
} from '../features/task-repeat-cfg/store/task-repeat-cfg.actions';
import { selectTaskRepeatCfgFeatureState } from '../features/task-repeat-cfg/store/task-repeat-cfg.selectors';
import { Task } from '../features/tasks/task.model';
import { selectAllTasks, selectTasksById } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import {
  isSolidTaskRepeatCfgDeleteAction,
  isSolidTaskRepeatCfgSaveAction,
  SolidTaskRepeatCfgDeleteAction,
  SolidTaskRepeatCfgSaveAction,
} from './solid-task-repeat-cfg-action-types';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTaskRepeatCfgPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTaskRepeatCfgRepository = inject(SolidTaskRepeatCfgRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskRepeatCfgSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskRepeatCfgSaveAction & PersistentAction =>
            isSolidTaskRepeatCfgSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            taskRepeatCfgs: this.taskRepeatCfgsForSaveAction(action),
            tasks: this.tasksForSaveAction(action),
          }).pipe(
            concatMap(({ taskRepeatCfgs, tasks }) =>
              from(
                settleSolidMutations([
                  ...taskRepeatCfgs.map((taskRepeatCfg) =>
                    this.solidTaskRepeatCfgRepository.saveTaskRepeatCfg(taskRepeatCfg),
                  ),
                  ...tasks.map((task) => this.solidTaskRepository.saveTask(task)),
                ]),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistTaskRepeatCfgDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskRepeatCfgDeleteAction & PersistentAction =>
            isSolidTaskRepeatCfgDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.tasksForDeleteAction(action).pipe(
            concatMap((tasks) =>
              from(
                settleSolidMutations([
                  ...this.taskRepeatCfgIdsForDeleteAction(action).map((id) =>
                    this.solidTaskRepeatCfgRepository.deleteTaskRepeatCfg(id),
                  ),
                  ...tasks.map((task) => this.solidTaskRepository.saveTask(task)),
                ]),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private taskRepeatCfgsForSaveAction(
    action: SolidTaskRepeatCfgSaveAction,
  ): Observable<TaskRepeatCfg[]> {
    return this.store.select(selectTaskRepeatCfgFeatureState).pipe(
      take(1),
      map((state) =>
        this.taskRepeatCfgIdsForSaveAction(action)
          .map((id) => state.entities[id])
          .filter((taskRepeatCfg): taskRepeatCfg is TaskRepeatCfg => !!taskRepeatCfg),
      ),
    );
  }

  private tasksForSaveAction(action: SolidTaskRepeatCfgSaveAction): Observable<Task[]> {
    return action.type === addTaskRepeatCfgToTask.type
      ? this.store.select(selectTasksById, { ids: [action.taskId] }).pipe(take(1))
      : of([]);
  }

  private taskRepeatCfgIdsForSaveAction(action: SolidTaskRepeatCfgSaveAction): string[] {
    if (action.type === addTaskRepeatCfgToTask.type) {
      return [action.taskRepeatCfg.id];
    }

    if (action.type === updateTaskRepeatCfg.type) {
      return [action.taskRepeatCfg.id as string];
    }

    if (action.type === updateTaskRepeatCfgs.type) {
      return action.ids;
    }

    return [action.repeatCfgId];
  }

  private tasksForDeleteAction(
    action: SolidTaskRepeatCfgDeleteAction,
  ): Observable<Task[]> {
    return action.type === TaskSharedActions.deleteTaskRepeatCfg.type
      ? this.store.select(selectAllTasks).pipe(take(1))
      : of([]);
  }

  private taskRepeatCfgIdsForDeleteAction(
    action: SolidTaskRepeatCfgDeleteAction,
  ): string[] {
    if (action.type === deleteTaskRepeatCfg.type) {
      return [action.id];
    }

    if (action.type === deleteTaskRepeatCfgs.type) {
      return action.ids;
    }

    return [action.taskRepeatCfgId];
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source:
        'SolidTaskRepeatCfgPersistenceEffects: failed to persist repeat config change',
    });
  }
}
