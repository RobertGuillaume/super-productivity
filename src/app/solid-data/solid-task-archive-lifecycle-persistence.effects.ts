import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { sanitizeTasksForArchiving } from '../features/archive/archive.service';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { Task, TaskWithSubTasks } from '../features/tasks/task.model';
import { flattenTasks, selectAllTasks } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import {
  isSolidTaskArchiveLifecycleAction,
  SolidTaskArchiveLifecycleAction,
} from './solid-task-archive-lifecycle-action-types';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTaskArchiveLifecyclePersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidArchivedTaskRepository = inject(SolidArchivedTaskRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidSectionRepository = inject(SolidSectionRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskArchiveLifecycle$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskArchiveLifecycleAction & PersistentAction =>
            isSolidTaskArchiveLifecycleAction(action) &&
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
              from(this.persistLifecycle(action, tasks, projects, tags, sections)),
            ),
            catchError((error) => this.handlePersistenceError(error, action)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistLifecycle(
    action: SolidTaskArchiveLifecycleAction,
    tasks: readonly Task[],
    projects: readonly Project[],
    tags: readonly Tag[],
    sections: readonly Section[],
  ): Promise<void> {
    if (action.type === TaskSharedActions.moveToArchive.type) {
      const archivedTasks = this.tasksForArchive(action.tasks);
      await settleSolidMutations([
        ...archivedTasks.map((task) =>
          this.solidArchivedTaskRepository.saveArchivedTask(
            task,
            'young',
            this.solidDataLayerState.requireMutationContext(action),
          ),
        ),
        ...archivedTasks.map((task) =>
          this.solidTaskRepository.deleteTask(
            task.id,
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
      return;
    }

    const restoredArchiveTaskIds = this.restoredArchiveTaskIdsForAction(action);
    await settleSolidMutations([
      ...restoredArchiveTaskIds.map((taskId) =>
        this.solidArchivedTaskRepository.deleteArchivedTask(
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

  private tasksForArchive(tasks: readonly TaskWithSubTasks[]): Task[] {
    const now = Date.now();
    const sanitizedTasks = sanitizeTasksForArchiving(
      [...tasks],
      'SolidTaskArchiveLifecyclePersistenceEffects',
    );
    const flatTasks = flattenTasks(sanitizedTasks);

    return flatTasks.map((task) => {
      const parent = task.parentId
        ? flatTasks.find((candidate) => candidate.id === task.parentId)
        : undefined;

      return {
        ...task,
        reminderId: undefined,
        isDone: true,
        dueWithTime: undefined,
        dueDay: undefined,
        _hideSubTasksMode: undefined,
        doneOn: task.isDone && task.doneOn ? task.doneOn : parent?.doneOn || now,
      };
    });
  }

  private restoredArchiveTaskIdsForAction(
    action: SolidTaskArchiveLifecycleAction,
  ): string[] {
    if (action.type !== TaskSharedActions.restoreTask.type) {
      return [];
    }

    return [action.task.id, ...action.subTasks.map((subTask) => subTask.id)];
  }

  private handlePersistenceError(error: unknown, action: object): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      action,
      source:
        'SolidTaskArchiveLifecyclePersistenceEffects: failed to persist task lifecycle',
    });
  }
}
