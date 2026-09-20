import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import {
  deletePluginMetadata,
  deletePluginUserData,
  upsertPluginUserData,
} from '../plugins/store/plugin.actions';
import { selectPluginMetadataFeatureState } from '../plugins/store/plugin-metadata.reducer';
import { selectPluginUserDataFeatureState } from '../plugins/store/plugin-user-data.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidPluginDataDeleteAction,
  isSolidPluginDataSaveAction,
  SolidPluginDataDeleteAction,
  SolidPluginDataSaveAction,
} from './solid-plugin-data-action-types';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';

@Injectable()
export class SolidPluginDataPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidPluginDataRepository = inject(SolidPluginDataRepository);
  private readonly snackService = inject(SnackService);

  persistPluginDataSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidPluginDataSaveAction & PersistentAction =>
            isSolidPluginDataSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.pluginDataForSaveAction(action).pipe(
            concatMap((pluginData) =>
              pluginData === null ? EMPTY : from(this.savePluginData(pluginData, action)),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistPluginDataDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidPluginDataDeleteAction & PersistentAction =>
            isSolidPluginDataDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.deletePluginData(action)).pipe(
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private pluginDataForSaveAction(
    action: SolidPluginDataSaveAction,
  ): Observable<PluginUserData | PluginMetadata | null> {
    if (action.type === upsertPluginUserData.type) {
      return this.store.select(selectPluginUserDataFeatureState).pipe(
        take(1),
        map(
          (pluginUserDataState) =>
            pluginUserDataState.find(
              (pluginUserData) => pluginUserData.id === action.pluginUserData.id,
            ) ?? null,
        ),
      );
    }

    return this.store.select(selectPluginMetadataFeatureState).pipe(
      take(1),
      map(
        (pluginMetadataState) =>
          pluginMetadataState.find(
            (pluginMetadata) => pluginMetadata.id === action.pluginMetadata.id,
          ) ?? null,
      ),
    );
  }

  private savePluginData(
    pluginData: PluginUserData | PluginMetadata,
    action: object,
  ): Promise<PluginUserData | PluginMetadata> {
    if ('data' in pluginData) {
      return this.solidPluginDataRepository.savePluginUserData(
        pluginData,
        this.solidDataLayerState.requireMutationContext(action),
      );
    }

    return this.solidPluginDataRepository.savePluginMetadata(
      pluginData,
      this.solidDataLayerState.requireMutationContext(action),
    );
  }

  private deletePluginData(action: SolidPluginDataDeleteAction): Promise<void> {
    if (action.type === deletePluginUserData.type) {
      return this.solidPluginDataRepository.deletePluginUserData(
        action.pluginId,
        this.solidDataLayerState.requireMutationContext(action),
      );
    }

    if (action.type === deletePluginMetadata.type) {
      return this.solidPluginDataRepository.deletePluginMetadata(
        action.pluginId,
        this.solidDataLayerState.requireMutationContext(action),
      );
    }

    return Promise.resolve();
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidPluginDataPersistenceEffects: failed to persist plugin data',
    });
  }
}
