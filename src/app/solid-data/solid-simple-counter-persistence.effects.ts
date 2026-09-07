import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { SimpleCounter } from '../features/simple-counter/simple-counter.model';
import {
  deleteSimpleCounter,
  updateAllSimpleCounters,
  updateSimpleCounter,
  updateSimpleCounterOrder,
} from '../features/simple-counter/store/simple-counter.actions';
import { selectSimpleCounterFeatureState } from '../features/simple-counter/store/simple-counter.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidSimpleCounterDeleteAction,
  isSolidSimpleCounterSaveAction,
  SolidSimpleCounterDeleteAction,
  SolidSimpleCounterSaveAction,
} from './solid-simple-counter-action-types';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';

interface OrderedSimpleCounter {
  simpleCounter: SimpleCounter;
  order: number;
}

interface SimpleCounterSaveSelection {
  simpleCounters: OrderedSimpleCounter[];
  isReplaceAll: boolean;
}

@Injectable()
export class SolidSimpleCounterPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidSimpleCounterRepository = inject(SolidSimpleCounterRepository);
  private readonly snackService = inject(SnackService);

  persistSimpleCounterSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSimpleCounterSaveAction & PersistentAction =>
            isSolidSimpleCounterSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.simpleCountersForSaveAction(action).pipe(
            concatMap(({ simpleCounters, isReplaceAll }) =>
              from(
                isReplaceAll
                  ? this.solidSimpleCounterRepository.replaceSimpleCounters(
                      simpleCounters.map(
                        (orderedSimpleCounter) => orderedSimpleCounter.simpleCounter,
                      ),
                    )
                  : settleSolidMutations(
                      simpleCounters.map((orderedSimpleCounter) =>
                        this.solidSimpleCounterRepository.saveSimpleCounter(
                          orderedSimpleCounter.simpleCounter,
                          orderedSimpleCounter.order,
                        ),
                      ),
                    ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistSimpleCounterDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSimpleCounterDeleteAction & PersistentAction =>
            isSolidSimpleCounterDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(
            settleSolidMutations(
              this.simpleCounterIdsForDeleteAction(action).map((id) =>
                this.solidSimpleCounterRepository.deleteSimpleCounter(id),
              ),
            ),
          ).pipe(catchError((error) => this.handlePersistenceError(error))),
        ),
      ),
    { dispatch: false },
  );

  private simpleCountersForSaveAction(
    action: SolidSimpleCounterSaveAction,
  ): Observable<SimpleCounterSaveSelection> {
    return this.store.select(selectSimpleCounterFeatureState).pipe(
      take(1),
      map((state) => {
        const simpleCountersWithOrder = (state.ids as string[])
          .map((id, order) => {
            const simpleCounter = state.entities[id];
            return simpleCounter ? { simpleCounter, order } : null;
          })
          .filter(
            (orderedSimpleCounter): orderedSimpleCounter is OrderedSimpleCounter =>
              !!orderedSimpleCounter,
          );

        if (
          action.type === updateAllSimpleCounters.type ||
          action.type === updateSimpleCounterOrder.type
        ) {
          return {
            simpleCounters: simpleCountersWithOrder,
            isReplaceAll: action.type === updateAllSimpleCounters.type,
          };
        }

        const ids = this.simpleCounterIdsForSaveAction(action);
        const idSet = new Set(ids);
        return {
          simpleCounters: simpleCountersWithOrder.filter((orderedSimpleCounter) =>
            idSet.has(orderedSimpleCounter.simpleCounter.id),
          ),
          isReplaceAll: false,
        };
      }),
    );
  }

  private simpleCounterIdsForSaveAction(action: SolidSimpleCounterSaveAction): string[] {
    if (action.type === updateAllSimpleCounters.type) {
      return action.items.map((item) => item.id);
    }

    if (action.type === updateSimpleCounterOrder.type) {
      return action.ids;
    }

    if (action.type === updateSimpleCounter.type) {
      return [action.simpleCounter.id as string];
    }

    if ('id' in action) {
      return [String(action.id)];
    }

    if ('simpleCounter' in action) {
      return [String(action.simpleCounter.id)];
    }

    return [];
  }

  private simpleCounterIdsForDeleteAction(
    action: SolidSimpleCounterDeleteAction,
  ): string[] {
    if (action.type === deleteSimpleCounter.type) {
      return [action.id];
    }

    return action.ids;
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidSimpleCounterPersistenceEffects: failed to persist simple counter',
    });
  }
}
