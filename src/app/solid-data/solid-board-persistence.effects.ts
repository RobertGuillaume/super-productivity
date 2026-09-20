import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { BoardCfg } from '../features/boards/boards.model';
import {
  sortBoards,
  updatePanelCfgTaskIds,
} from '../features/boards/store/boards.actions';
import { selectBoardsState } from '../features/boards/store/boards.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidBoardRepository } from './solid-board.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidBoardDeleteAction,
  isSolidBoardSaveAction,
  SolidBoardDeleteAction,
  SolidBoardSaveAction,
} from './solid-board-action-types';

interface OrderedBoard {
  board: BoardCfg;
  order: number;
}

@Injectable()
export class SolidBoardPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidBoardRepository = inject(SolidBoardRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly snackService = inject(SnackService);

  persistBoardSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidBoardSaveAction & PersistentAction =>
            isSolidBoardSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.boardsForSaveAction(action).pipe(
            concatMap((boards) =>
              from(
                settleSolidMutations(
                  boards.map((board) =>
                    this.solidBoardRepository.saveBoard(
                      board.board,
                      board.order,
                      this.solidDataLayerState.requireMutationContext(action),
                    ),
                  ),
                ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistBoardDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidBoardDeleteAction & PersistentAction =>
            isSolidBoardDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(
            this.solidBoardRepository.deleteBoard(
              action.id,
              this.solidDataLayerState.requireMutationContext(action),
            ),
          ).pipe(catchError((error) => this.handlePersistenceError(error, action))),
        ),
      ),
    { dispatch: false },
  );

  private boardsForSaveAction(action: SolidBoardSaveAction): Observable<OrderedBoard[]> {
    return this.store.select(selectBoardsState).pipe(
      take(1),
      map((state) => {
        const boards = state.boardCfgs.map((board, order) => ({ board, order }));

        if (action.type === sortBoards.type) {
          return boards;
        }

        if (action.type === updatePanelCfgTaskIds.type) {
          return boards.filter(({ board }) =>
            board.panels.some((panel) => panel.id === action.panelId),
          );
        }

        if ('board' in action) {
          return boards.filter(({ board }) => board.id === action.board.id);
        }

        return boards.filter(({ board }) => board.id === action.id);
      }),
    );
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidBoardPersistenceEffects: failed to persist board',
    });
  }
}
