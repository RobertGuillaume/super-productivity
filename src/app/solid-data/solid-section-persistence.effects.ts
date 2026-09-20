import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectSectionFeatureState } from '../features/section/store/section.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidProjectRepository } from './solid-project.repository';
import {
  isSolidSectionCreateAction,
  isSolidSectionDeleteAction,
  isSolidSectionOrderAction,
  isSolidSectionUpdateAction,
  isSolidSectionWorkContextAction,
  SolidSectionCreateAction,
  SolidSectionDeleteAction,
  SolidSectionOrderAction,
  SolidSectionUpdateAction,
  SolidSectionWorkContextAction,
} from './solid-section-action-types';
import { SolidSectionRepository } from './solid-section.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidTagRepository } from './solid-tag.repository';

@Injectable()
export class SolidSectionPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidAppStateRepository = inject(SolidAppStateRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidSectionRepository = inject(SolidSectionRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly snackService = inject(SnackService);

  persistSectionCreate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSectionCreateAction & PersistentAction =>
            isSolidSectionCreateAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(
            this.solidSectionRepository.saveSection(
              action.section,
              this.solidDataLayerState.requireMutationContext(action),
            ),
          ).pipe(catchError((error) => this.handlePersistenceError(error, action))),
        ),
      ),
    { dispatch: false },
  );

  persistSectionUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSectionUpdateAction & PersistentAction =>
            isSolidSectionUpdateAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) => {
          const sectionIds = this.sectionIdsForUpdateAction(action);

          return this.store.select(selectSectionFeatureState).pipe(
            take(1),
            concatMap((state) =>
              from(
                settleSolidMutations(
                  sectionIds
                    .map((id) => {
                      const section = state.entities[id];
                      return section && section.isExpanded === undefined
                        ? { ...section, isExpanded: true }
                        : section;
                    })
                    .filter((section): section is Section => !!section)
                    .map((section) =>
                      this.solidSectionRepository.saveSection(
                        section,
                        this.solidDataLayerState.requireMutationContext(action),
                      ),
                    ),
                ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          );
        }),
      ),
    { dispatch: false },
  );

  persistSectionDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSectionDeleteAction & PersistentAction =>
            isSolidSectionDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(
            this.solidSectionRepository.deleteSection(
              action.id,
              this.solidDataLayerState.requireMutationContext(action),
            ),
          ).pipe(catchError((error) => this.handlePersistenceError(error, action))),
        ),
      ),
    { dispatch: false },
  );

  persistSectionOrder$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSectionOrderAction & PersistentAction =>
            isSolidSectionOrderAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store.select(selectSectionFeatureState).pipe(
            take(1),
            concatMap((state) =>
              from(
                this.solidAppStateRepository.saveAppStateOrder(
                  {
                    sectionOrder: state.ids as string[],
                  },
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

  persistSectionWorkContext$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidSectionWorkContextAction & PersistentAction =>
            isSolidSectionWorkContextAction(action) &&
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

  private sectionIdsForUpdateAction(action: SolidSectionUpdateAction): string[] {
    if (action.type === ActionType.SECTION_UPDATE) {
      return [action.section.id as string];
    }

    if (action.type === ActionType.SECTION_ADD_TASK) {
      return Array.from(
        new Set(
          action.sourceSectionId && action.sourceSectionId !== action.sectionId
            ? [action.sourceSectionId, action.sectionId]
            : [action.sectionId],
        ),
      );
    }

    return [action.sectionId];
  }

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
      source: 'SolidSectionPersistenceEffects: failed to persist section change',
    });
  }
}
