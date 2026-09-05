import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { syncTimeTracking } from '../features/time-tracking/store/time-tracking.actions';
import { selectTimeTrackingState } from '../features/time-tracking/store/time-tracking.selectors';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidTimeTrackingSaveAction,
  SolidTimeTrackingSaveAction,
} from './solid-time-tracking-action-types';
import {
  SolidTimeTrackingContextType,
  SolidTimeTrackingEntry,
  timeTrackingEntryId,
} from './solid-time-tracking.mapper';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';

@Injectable()
export class SolidTimeTrackingPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTimeTrackingRepository = inject(SolidTimeTrackingRepository);
  private readonly snackService = inject(SnackService);

  persistTimeTracking$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTimeTrackingSaveAction & PersistentAction =>
            isSolidTimeTrackingSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.timeTrackingEntryForAction(action).pipe(
            concatMap((entry) =>
              entry
                ? from(this.solidTimeTrackingRepository.saveTimeTrackingEntry(entry))
                : EMPTY,
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private timeTrackingEntryForAction(
    action: SolidTimeTrackingSaveAction,
  ): Observable<SolidTimeTrackingEntry | null> {
    const context =
      action.type === syncTimeTracking.type
        ? {
            contextType: action.contextType,
            contextId: action.contextId,
            date: action.date,
          }
        : {
            contextType: action.ctx.type,
            contextId: action.ctx.id,
            date: action.date,
          };

    return this.store.select(selectTimeTrackingState).pipe(
      take(1),
      map((state) => this.entryFromState(state, context)),
    );
  }

  private entryFromState(
    state: TimeTrackingState,
    context: {
      contextType: SolidTimeTrackingContextType;
      contextId: string;
      date: string;
    },
  ): SolidTimeTrackingEntry | null {
    const collection = context.contextType === 'TAG' ? state.tag : state.project;
    const data = collection[context.contextId]?.[context.date];

    return data
      ? {
          id: timeTrackingEntryId(context.contextType, context.contextId, context.date),
          contextType: context.contextType,
          contextId: context.contextId,
          date: context.date,
          data,
          updated: Date.now(),
        }
      : null;
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidTimeTrackingPersistenceEffects: failed to persist time tracking',
    });
  }
}
