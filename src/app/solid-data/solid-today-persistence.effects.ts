import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import {
  isSolidTodayTagOrderAction,
  isSolidTodayTaskPlanAction,
  SolidTodayTaskPlanAction,
} from './solid-today-action-types';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTodayPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistPlanTasksForToday$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTodayTaskPlanAction & PersistentAction =>
            isSolidTodayTaskPlanAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            tasks: this.store
              .select(selectTasksById, { ids: action.taskIds })
              .pipe(take(1)),
            todayTag: this.selectTodayTag(),
          }).pipe(
            concatMap(({ tasks, todayTag }) =>
              from(
                Promise.all([
                  ...tasks.map((task) => this.solidTaskRepository.saveTask(task)),
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

  persistTodayTagOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is PersistentAction =>
            isSolidTodayTagOrderAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.selectTodayTag().pipe(
            concatMap((todayTag) => from(this.solidTagRepository.saveTag(todayTag))),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private selectTodayTag(): Observable<Tag> {
    return this.store.select(selectTagById, { id: TODAY_TAG.id }).pipe(
      take(1),
      filter((tag): tag is Tag => !!tag),
      map((tag) => tag),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidTodayPersistenceEffects: failed to persist Today changes', {
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
