import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
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
            catchError((error) => {
              Log.err('SolidTaskPersistenceEffects: failed to persist task create', {
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
            }),
          ),
        ),
      ),
    { dispatch: false },
  );
}
