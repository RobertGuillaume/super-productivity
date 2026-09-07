import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import type { AuthState } from '@solid-intents/runtime';
import { mapTo, take } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import { allDataWasLoaded } from '../../root-store/meta/all-data-was-loaded.actions';
import { DataInitStateService } from './data-init-state.service';
import { OperationLogHydratorService } from '../../op-log/persistence/operation-log-hydrator.service';
import { OpLog } from '../log';
import { isSolidDataLayerPrimaryEnabled } from '../../solid-data/solid-data-layer-feature-flag';
import { SolidStartupService } from '../../solid-data/solid-startup.service';
import { SolidTaskHydrationService } from '../../solid-data/solid-task-hydration.service';
import { SolidPodRefreshCoordinatorService } from '../../solid-data/solid-pod-refresh-coordinator.service';
import { SolidDataLayerStateService } from '../../solid-data/solid-data-layer-state.service';

@Injectable({ providedIn: 'root' })
export class DataInitService {
  private _store$ = inject<Store<any>>(Store);
  private _dataInitStateService = inject(DataInitStateService);
  private _operationLogHydratorService = inject(OperationLogHydratorService);
  private _solidStartupService = inject(SolidStartupService);
  private _solidTaskHydrationService = inject(SolidTaskHydrationService);
  private _solidRefreshCoordinator = inject(SolidPodRefreshCoordinatorService);
  private _solidDataLayerState = inject(SolidDataLayerStateService);

  private _isAllDataLoadedInitially$: Observable<boolean> = from(
    this.reInit().catch((error) => {
      OpLog.err('DataInitService: Failed to initialize app data', error);
      this._solidDataLayerState.setPhase('unavailable');
    }),
  ).pipe(mapTo(true));

  constructor() {
    // TODO better construction than this
    this._isAllDataLoadedInitially$.pipe(take(1)).subscribe({
      next: (v) => {
        // here because to avoid circular dependencies
        this._store$.dispatch(allDataWasLoaded());
        this._dataInitStateService._neverUpdateOutsideDataInitService$.next(v);
      },
    });
  }

  // NOTE: it's important to remember that this doesn't mean that no changes are occurring any more
  // because the data load is triggered, but not necessarily already reflected inside the store
  async reInit(): Promise<void> {
    const isSolidPrimary = isSolidDataLayerPrimaryEnabled();
    let solidAuthState: AuthState | null = null;
    let didSolidBootFail = false;
    try {
      solidAuthState = await this._solidStartupService.bootIfEnabled();
    } catch (error) {
      if (!isSolidPrimary) {
        throw error;
      }
      didSolidBootFail = true;
      this._solidDataLayerState.addDiagnostics();
      this._solidDataLayerState.setPhase('unavailable');
      OpLog.err('DataInitService: Solid runtime boot failed', error);
    }

    if (isSolidPrimary) {
      this._solidDataLayerState.setPhase('hydrating-cache');
      await this._solidTaskHydrationService.hydrateStore();
      if (solidAuthState?.status === 'authenticated') {
        void this._solidRefreshCoordinator.start();
      } else {
        this._solidDataLayerState.setPhase(
          didSolidBootFail ? 'unavailable' : 'sign-in-required',
        );
      }
      return;
    }

    // Hydrate from Operation Log (which handles migration from legacy if needed)
    await this._operationLogHydratorService.hydrateStore();
  }
}
