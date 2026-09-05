import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { PlannerActions } from '../features/planner/store/planner.actions';
import { PlannerState } from '../features/planner/store/planner.reducer';
import { selectPlannerState } from '../features/planner/store/planner.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { isSolidPlannerAction, SolidPlannerAction } from './solid-planner-action-types';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidPlannerPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidPlannerRepository = inject(SolidPlannerRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistPlanner$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidPlannerAction & PersistentAction =>
            isSolidPlannerAction(action) && !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            plannerState: this.store.select(selectPlannerState).pipe(take(1)),
            tags: this.store.select(selectAllTags).pipe(take(1)),
            tasks: this.store.select(selectAllTasks).pipe(take(1)),
          }).pipe(
            concatMap(({ plannerState, tags, tasks }) =>
              from(this.persistPlannerState(action, plannerState, tasks, tags)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistPlannerState(
    action: SolidPlannerAction,
    plannerState: PlannerState,
    tasks: readonly Task[],
    tags: readonly Tag[],
  ): Promise<void> {
    const taskAndTagSideEffectActionTypes = new Set<string>([
      PlannerActions.transferTask.type,
      PlannerActions.moveBeforeTask.type,
      PlannerActions.planTaskForDay.type,
    ]);
    const shouldPersistTaskAndTagSideEffects = taskAndTagSideEffectActionTypes.has(
      action.type,
    );

    const affectedTask = tasks.find((task) => task.id === plannerTaskId(action));
    const todayTag = tags.find((tag) => tag.id === TODAY_TAG.id);

    await Promise.all([
      this.solidPlannerRepository.reconcilePlannerDays(plannerState),
      ...(shouldPersistTaskAndTagSideEffects
        ? [
            ...(affectedTask ? [this.solidTaskRepository.saveTask(affectedTask)] : []),
            ...(todayTag ? [this.solidTagRepository.saveTag(todayTag)] : []),
          ]
        : []),
    ]);
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidPlannerPersistenceEffects: failed to persist planner state',
    });
  }
}

const plannerTaskId = (action: SolidPlannerAction): string | undefined => {
  if (action.type === PlannerActions.moveBeforeTask.type) {
    return action.fromTask.id;
  }

  if (
    action.type === PlannerActions.transferTask.type ||
    action.type === PlannerActions.planTaskForDay.type
  ) {
    return action.task.id;
  }

  return undefined;
};
