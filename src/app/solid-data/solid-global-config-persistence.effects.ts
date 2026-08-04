import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { selectConfigFeatureState } from '../features/config/store/global-config.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import {
  isSolidGlobalConfigSaveAction,
  SolidGlobalConfigSaveAction,
} from './solid-global-config-action-types';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';

@Injectable()
export class SolidGlobalConfigPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidGlobalConfigRepository = inject(SolidGlobalConfigRepository);
  private readonly snackService = inject(SnackService);

  persistGlobalConfig$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidGlobalConfigSaveAction & PersistentAction =>
            isSolidGlobalConfigSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.store.select(selectConfigFeatureState).pipe(
            take(1),
            concatMap((config) =>
              from(this.solidGlobalConfigRepository.saveGlobalConfig(config)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidGlobalConfigPersistenceEffects: failed to persist global config', {
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
