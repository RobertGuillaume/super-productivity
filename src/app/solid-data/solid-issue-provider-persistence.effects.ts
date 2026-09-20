import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { IssueProvider } from '../features/issue/issue.model';
import { IssueProviderActions } from '../features/issue/store/issue-provider.actions';
import { selectIssueProviderState } from '../features/issue/store/issue-provider.selectors';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import {
  isSolidIssueProviderDeleteAction,
  isSolidIssueProviderSaveAction,
  SolidIssueProviderDeleteAction,
  SolidIssueProviderSaveAction,
} from './solid-issue-provider-action-types';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidIssueProviderPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidIssueProviderRepository = inject(SolidIssueProviderRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistIssueProviderSave$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidIssueProviderSaveAction & PersistentAction =>
            isSolidIssueProviderSaveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store.select(selectIssueProviderState).pipe(
            take(1),
            concatMap((state) =>
              from(
                settleSolidMutations(
                  this.issueProvidersForSaveAction(action, state.ids as string[])
                    .map((id) => state.entities[id])
                    .filter(
                      (issueProvider): issueProvider is IssueProvider => !!issueProvider,
                    )
                    .map((issueProvider) =>
                      this.solidIssueProviderRepository.saveIssueProvider(
                        issueProvider,
                        (state.ids as string[]).indexOf(issueProvider.id),
                        this.solidDataLayerState.requireMutationContext(action),
                      ),
                    ),
                ),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistIssueProviderDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidIssueProviderDeleteAction & PersistentAction =>
            isSolidIssueProviderDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store.select(selectTasksById, { ids: action.taskIdsToUnlink }).pipe(
            take(1),
            concatMap((tasks) =>
              from(
                settleSolidMutations([
                  ...this.issueProviderIdsForDeleteAction(action).map((id) =>
                    this.solidIssueProviderRepository.deleteIssueProvider(
                      id,
                      this.solidDataLayerState.requireMutationContext(action),
                    ),
                  ),
                  ...tasks.map((task) =>
                    this.solidTaskRepository.saveTask(
                      task,
                      this.solidDataLayerState.requireMutationContext(action),
                    ),
                  ),
                ]),
              ),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private issueProvidersForSaveAction(
    action: SolidIssueProviderSaveAction,
    issueProviderIds: string[],
  ): string[] {
    if (action.type === IssueProviderActions.addIssueProvider.type) {
      return [action.issueProvider.id];
    }

    if (action.type === IssueProviderActions.updateIssueProvider.type) {
      return [action.issueProvider.id as string];
    }

    return issueProviderIds;
  }

  private issueProviderIdsForDeleteAction(
    action: SolidIssueProviderDeleteAction,
  ): string[] {
    return action.type === TaskSharedActions.deleteIssueProvider.type
      ? [action.issueProviderId]
      : action.ids;
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidIssueProviderPersistenceEffects: failed to persist provider change',
    });
  }
}
