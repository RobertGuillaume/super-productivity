import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from, Observable } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectSectionFeatureState } from '../features/section/store/section.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
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
import { SolidTagRepository } from './solid-tag.repository';

@Injectable()
export class SolidSectionPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
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
          from(this.solidSectionRepository.saveSection(action.section)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
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
                Promise.all(
                  sectionIds
                    .map((id) => {
                      const section = state.entities[id];
                      return section && section.isExpanded === undefined
                        ? { ...section, isExpanded: true }
                        : section;
                    })
                    .filter((section): section is Section => !!section)
                    .map((section) => this.solidSectionRepository.saveSection(section)),
                ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
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
          from(this.solidSectionRepository.deleteSection(action.id)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
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
        concatMap(() =>
          this.store.select(selectSectionFeatureState).pipe(
            take(1),
            concatMap((state) =>
              from(
                this.solidAppStateRepository.saveAppStateOrder({
                  sectionOrder: state.ids as string[],
                }),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error)),
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
            ? this.persistProjectTaskOrder(action.workContextId)
            : this.persistTagTaskOrder(action.workContextId),
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
    Log.err('SolidSectionPersistenceEffects: failed to persist section change', {
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
