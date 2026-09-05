import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { updateNoteOrder } from '../features/note/store/note.actions';
import { selectNoteTodayOrder } from '../features/note/store/note.reducer';
import { Project } from '../features/project/project.model';
import { updateProjectOrder } from '../features/project/store/project.actions';
import {
  selectProjectById,
  selectProjectFeatureState,
} from '../features/project/store/project.selectors';
import { INBOX_PROJECT } from '../features/project/project.const';
import { selectTagFeatureState } from '../features/tag/store/tag.reducer';
import { updateTagOrder } from '../features/tag/store/tag.actions';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidProjectRepository } from './solid-project.repository';

@Injectable()
export class SolidAppStatePersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidAppStateRepository = inject(SolidAppStateRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly snackService = inject(SnackService);

  persistProjectOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof updateProjectOrder> & PersistentAction =>
            action.type === ActionType.PROJECT_UPDATE_ORDER &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.store.select(selectProjectFeatureState).pipe(
            take(1),
            concatMap((state) =>
              from(
                this.solidAppStateRepository.saveAppStateOrder({
                  projectOrder: (state.ids as string[]).filter(
                    (id) => id !== INBOX_PROJECT.id,
                  ),
                }),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistTagOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof updateTagOrder> & PersistentAction =>
            action.type === ActionType.TAG_UPDATE_ORDER &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap(() =>
          this.store.select(selectTagFeatureState).pipe(
            take(1),
            concatMap((state) =>
              from(
                this.solidAppStateRepository.saveAppStateOrder({
                  tagOrder: state.ids as string[],
                }),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistNoteOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof updateNoteOrder> & PersistentAction =>
            action.type === ActionType.NOTE_UPDATE_ORDER &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          action.activeContextType === WorkContextType.PROJECT
            ? this.persistProjectNoteOrder(action.activeContextId)
            : this.persistTodayNoteOrder(),
        ),
      ),
    { dispatch: false },
  );

  private persistProjectNoteOrder(projectId: string): Observable<unknown> {
    return this.store.select(selectProjectById, { id: projectId }).pipe(
      take(1),
      filter((project): project is Project => !!project),
      concatMap((project) => from(this.solidProjectRepository.saveProject(project))),
      catchError((error) => this.handlePersistenceError(error)),
    );
  }

  private persistTodayNoteOrder(): Observable<unknown> {
    return this.store.select(selectNoteTodayOrder).pipe(
      take(1),
      concatMap((noteTodayOrder) =>
        from(
          this.solidAppStateRepository.saveAppStateOrder({
            noteTodayOrder,
          }),
        ),
      ),
      catchError((error) => this.handlePersistenceError(error)),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      source: 'SolidAppStatePersistenceEffects: failed to persist app order change',
    });
  }
}
