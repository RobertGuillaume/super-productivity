import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidTagRepository } from './solid-tag.repository';
import {
  isSolidWorkContextMoveAction,
  SolidWorkContextMoveAction,
} from './solid-work-context-action-types';

@Injectable()
export class SolidWorkContextPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
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
            ? this.persistProjectTaskOrder(action.workContextId)
            : this.persistTagTaskOrder(action.workContextId),
        ),
      ),
    { dispatch: false },
  );

  private persistProjectTaskOrder(projectId: string): Observable<unknown> {
    return this.store.select(selectProjectById, { id: projectId }).pipe(
      take(1),
      filter((project): project is Project => !!project),
      concatMap((project) => from(this.solidProjectRepository.saveProject(project))),
      catchError((error) => this.handlePersistenceError(error)),
    );
  }

  private persistTagTaskOrder(tagId: string): Observable<unknown> {
    return this.store.select(selectTagById, { id: tagId }).pipe(
      take(1),
      filter((tag): tag is Tag => !!tag),
      concatMap((tag) => from(this.solidTagRepository.saveTag(tag))),
      catchError((error) => this.handlePersistenceError(error)),
    );
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidWorkContextPersistenceEffects: failed to persist work-context order', {
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
