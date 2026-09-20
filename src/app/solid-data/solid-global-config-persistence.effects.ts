import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { selectConfigFeatureState } from '../features/config/store/global-config.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import {
  isSolidGlobalConfigSaveAction,
  SolidGlobalConfigSaveAction,
} from './solid-global-config-action-types';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';

@Injectable()
export class SolidGlobalConfigPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
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
        concatMap((action) =>
          this.store.select(selectConfigFeatureState).pipe(
            take(1),
            concatMap((config) =>
              from(
                this.solidGlobalConfigRepository.saveGlobalConfig(
                  config,
                  this.solidDataLayerState.requireMutationContext(action),
                ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidGlobalConfigPersistenceEffects: failed to persist global config',
    });
  }
}
