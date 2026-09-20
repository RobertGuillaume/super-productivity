import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { BatchTaskDelete } from '@super-productivity/plugin-api';
import { EMPTY, forkJoin, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidProjectRepository } from './solid-project.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import {
  isSolidTaskBatchAction,
  SolidTaskBatchAction,
} from './solid-task-batch-action-types';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTaskBatchPersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidSectionRepository = inject(SolidSectionRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskBatch$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskBatchAction & PersistentAction =>
            isSolidTaskBatchAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            projects: this.store.select(selectAllProjects).pipe(take(1)),
            sections: this.store.select(selectAllSections).pipe(take(1)),
            tags: this.store.select(selectAllTags).pipe(take(1)),
            tasks: this.store.select(selectAllTasks).pipe(take(1)),
          }).pipe(
            concatMap(({ projects, sections, tags, tasks }) =>
              from(this.persistBatch(action, tasks, projects, tags, sections)),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistBatch(
    action: SolidTaskBatchAction,
    tasks: readonly Task[],
    projects: readonly Project[],
    tags: readonly Tag[],
    sections: readonly Section[],
  ): Promise<void> {
    await settleSolidMutations([
      ...this.deletedTaskIdsForAction(action).map((taskId) =>
        this.solidTaskRepository.deleteTask(
          taskId,
          this.solidDataLayerState.requireMutationContext(action),
        ),
      ),
      ...tasks.map((task) =>
        this.solidTaskRepository.saveTask(
          task,
          this.solidDataLayerState.requireMutationContext(action),
        ),
      ),
      ...projects.map((project) =>
        this.solidProjectRepository.saveProject(
          project,
          this.solidDataLayerState.requireMutationContext(action),
        ),
      ),
      ...tags.map((tag) =>
        this.solidTagRepository.saveTag(
          tag,
          this.solidDataLayerState.requireMutationContext(action),
        ),
      ),
      ...sections.map((section) =>
        this.solidSectionRepository.saveSection(
          section,
          this.solidDataLayerState.requireMutationContext(action),
        ),
      ),
    ]);
  }

  private deletedTaskIdsForAction(action: SolidTaskBatchAction): string[] {
    if (action.type !== TaskSharedActions.batchUpdateForProject.type) {
      return [];
    }

    return action.operations
      .filter((operation): operation is BatchTaskDelete => operation.type === 'delete')
      .map((operation) => operation.taskId);
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source: 'SolidTaskBatchPersistenceEffects: failed to persist task batch mutation',
    });
  }
}
