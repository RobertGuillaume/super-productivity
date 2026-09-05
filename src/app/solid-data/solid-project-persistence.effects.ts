import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import {
  archiveProject,
  completeProject,
  addProject,
  reopenProject,
  toggleHideFromMenu,
  unarchiveProject,
  updateProject,
  updateProjectAdvancedCfg,
} from '../features/project/store/project.actions';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Project } from '../features/project/project.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidProjectTaskOrderAction,
  projectIdForSolidProjectTaskOrderAction,
  SolidProjectTaskOrderAction,
  SOLID_PROJECT_TASK_ORDER_ACTION_TYPES,
} from './solid-project-task-order-action-types';
import { SolidProjectRepository } from './solid-project.repository';

type SolidProjectUpdateAction =
  | ReturnType<typeof updateProject>
  | ReturnType<typeof updateProjectAdvancedCfg>
  | ReturnType<typeof archiveProject>
  | ReturnType<typeof unarchiveProject>
  | ReturnType<typeof completeProject>
  | ReturnType<typeof reopenProject>
  | ReturnType<typeof toggleHideFromMenu>
  | SolidProjectTaskOrderAction;

@Injectable()
export class SolidProjectPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly snackService = inject(SnackService);

  persistProjectCreate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof addProject> & PersistentAction =>
            action.type === ActionType.PROJECT_ADD &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidProjectRepository.saveProject(action.project)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistProjectUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidProjectUpdateAction & PersistentAction =>
            isSolidProjectUpdateAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store
            .select(selectProjectById, { id: this.projectIdForUpdateAction(action) })
            .pipe(
              take(1),
              filter((project): project is Project => !!project),
              concatMap((project) =>
                from(this.solidProjectRepository.saveProject(project)),
              ),
              catchError((error) => this.handlePersistenceError(error)),
            ),
        ),
      ),
    { dispatch: false },
  );

  private projectIdForUpdateAction(action: SolidProjectUpdateAction): string {
    if (action.type === ActionType.PROJECT_UPDATE) {
      return action.project.id as string;
    }

    if (action.type === ActionType.PROJECT_UPDATE_ADVANCED_CFG) {
      return action.projectId;
    }

    if (isSolidProjectTaskOrderAction(action)) {
      return projectIdForSolidProjectTaskOrderAction(action);
    }

    return action.id;
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      source: 'SolidProjectPersistenceEffects: failed to persist project change',
    });
  }
}

const SOLID_PROJECT_UPDATE_ACTION_TYPES = new Set<string>([
  ActionType.PROJECT_UPDATE,
  ActionType.PROJECT_UPDATE_ADVANCED_CFG,
  ActionType.PROJECT_ARCHIVE,
  ActionType.PROJECT_UNARCHIVE,
  ActionType.PROJECT_COMPLETE,
  ActionType.PROJECT_REOPEN,
  ActionType.PROJECT_TOGGLE_HIDE,
  ...SOLID_PROJECT_TASK_ORDER_ACTION_TYPES,
]);

const isSolidProjectUpdateAction = (
  action: unknown,
): action is SolidProjectUpdateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PROJECT_UPDATE_ACTION_TYPES.has((action as { type: string }).type);
