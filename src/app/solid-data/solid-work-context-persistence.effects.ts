import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidTagRepository } from './solid-tag.repository';
import {
  isSolidWorkContextMoveAction,
  SolidWorkContextMoveAction,
} from './solid-work-context-action-types';

@Injectable()
export class SolidWorkContextPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly snackService = inject(SnackService);

  persistWorkContextTaskOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidWorkContextMoveAction & PersistentAction =>
            isSolidWorkContextMoveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          action.workContextType === WorkContextType.PROJECT
            ? this.persistProjectTaskOrder(action.workContextId, action)
            : this.persistTagTaskOrder(action.workContextId, action),
        ),
      ),
    { dispatch: false },
  );

  private persistProjectTaskOrder(
    projectId: string,
    action: object,
  ): Observable<unknown> {
    return this.store.select(selectProjectById, { id: projectId }).pipe(
      take(1),
      filter((project): project is Project => !!project),
      concatMap((project) =>
        from(
          this.solidProjectRepository.saveProject(
            project,
            this.solidDataLayerState.requireMutationContext(action),
          ),
        ),
      ),
      catchError((error) => this.handlePersistenceError(error, action)),
    );
  }

  private persistTagTaskOrder(tagId: string, action: object): Observable<unknown> {
    return this.store.select(selectTagById, { id: tagId }).pipe(
      take(1),
      filter((tag): tag is Tag => !!tag),
      concatMap((tag) =>
        from(
          this.solidTagRepository.saveTag(
            tag,
            this.solidDataLayerState.requireMutationContext(action),
          ),
        ),
      ),
      catchError((error) => this.handlePersistenceError(error, action)),
    );
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidWorkContextPersistenceEffects: failed to persist work-context order',
    });
  }
}
