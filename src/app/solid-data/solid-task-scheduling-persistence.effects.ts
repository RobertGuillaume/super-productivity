import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { Task } from '../features/tasks/task.model';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidTagRepository } from './solid-tag.repository';
import {
  isSolidTaskSchedulingAction,
  SolidTaskSchedulingAction,
} from './solid-task-scheduling-action-types';
import { SolidTaskRepository } from './solid-task.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';

@Injectable()
export class SolidTaskSchedulingPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskScheduling$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskSchedulingAction & PersistentAction =>
            isSolidTaskSchedulingAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            task: this.selectTask(this.taskIdForAction(action)),
            todayTag: this.selectTodayTag(),
          }).pipe(
            concatMap(({ task, todayTag }) =>
              from(
                settleSolidMutations([
                  this.solidTaskRepository.saveTask(task),
                  this.solidTagRepository.saveTag(todayTag),
                ]),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private taskIdForAction(action: SolidTaskSchedulingAction): string {
    if (
      action.type === TaskSharedActions.scheduleTaskWithTime.type ||
      action.type === TaskSharedActions.reScheduleTaskWithTime.type
    ) {
      return action.task.id;
    }

    return action.id;
  }

  private selectTask(taskId: string): Observable<Task> {
    return this.store.select(selectTasksById, { ids: [taskId] }).pipe(
      take(1),
      map((tasks) => tasks[0]),
      filter((task): task is Task => !!task),
    );
  }

  private selectTodayTag(): Observable<Tag> {
    return this.store.select(selectTagById, { id: TODAY_TAG.id }).pipe(
      take(1),
      filter((tag): tag is Tag => !!tag),
      map((tag) => tag),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidTaskSchedulingPersistenceEffects: failed to persist task scheduling',
    });
  }
}
