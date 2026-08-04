import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { selectMenuTreeState } from '../features/menu-tree/store/menu-tree.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import {
  isSolidMenuTreeSaveAction,
  SolidMenuTreeSaveAction,
} from './solid-menu-tree-action-types';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';

@Injectable()
export class SolidMenuTreePersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidMenuTreeRepository = inject(SolidMenuTreeRepository);
  private readonly snackService = inject(SnackService);

  persistMenuTree$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidMenuTreeSaveAction & PersistentAction =>
            isSolidMenuTreeSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.store.select(selectMenuTreeState).pipe(
            take(1),
            concatMap((menuTree) =>
              from(this.solidMenuTreeRepository.saveMenuTree(menuTree)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidMenuTreePersistenceEffects: failed to persist menu tree', {
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
