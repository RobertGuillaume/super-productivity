import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, map, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Metric } from '../features/metric/metric.model';
import { logFocusSession } from '../features/metric/store/metric.actions';
import { selectMetricFeatureState } from '../features/metric/store/metric.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidMetricDeleteAction,
  isSolidMetricSaveAction,
  SolidMetricDeleteAction,
  SolidMetricSaveAction,
} from './solid-metric-action-types';
import { SolidMetricRepository } from './solid-metric.repository';

@Injectable()
export class SolidMetricPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidMetricRepository = inject(SolidMetricRepository);
  private readonly snackService = inject(SnackService);

  persistMetricSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidMetricSaveAction & PersistentAction =>
            isSolidMetricSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter(
          (action) =>
            action.type !== logFocusSession.type ||
            (action as ReturnType<typeof logFocusSession>).duration > 0,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.metricForSaveAction(action).pipe(
            concatMap((metric) =>
              metric ? from(this.solidMetricRepository.saveMetric(metric)) : EMPTY,
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistMetricDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidMetricDeleteAction & PersistentAction =>
            isSolidMetricDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidMetricRepository.deleteMetric(action.id)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private metricForSaveAction(action: SolidMetricSaveAction): Observable<Metric | null> {
    const metricId = this.metricIdForSaveAction(action);
    return this.store.select(selectMetricFeatureState).pipe(
      take(1),
      map((state): Metric | null => state.entities[metricId] ?? null),
    );
  }

  private metricIdForSaveAction(action: SolidMetricSaveAction): string {
    if (action.type === logFocusSession.type) {
      return action.day;
    }

    return String(action.metric.id);
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidMetricPersistenceEffects: failed to persist metric',
    });
  }
}
