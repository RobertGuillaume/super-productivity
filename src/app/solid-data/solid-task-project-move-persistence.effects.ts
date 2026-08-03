import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import {
  isSolidTaskProjectMoveAction,
  SolidTaskProjectMoveAction,
} from './solid-task-project-move-action-types';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidTaskProjectMovePersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidSectionRepository = inject(SolidSectionRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistTaskProjectMove$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTaskProjectMoveAction & PersistentAction =>
            isSolidTaskProjectMoveAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            tasks: this.store.select(selectAllTasks).pipe(take(1)),
            projects: this.store.select(selectAllProjects).pipe(take(1)),
            sections: this.store.select(selectAllSections).pipe(take(1)),
          }).pipe(
            concatMap(({ tasks, projects, sections }) =>
              from(this.persistMove(action, tasks, projects, sections)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistMove(
    action: SolidTaskProjectMoveAction,
    tasks: readonly Task[],
    projects: readonly Project[],
    sections: readonly Section[],
  ): Promise<void> {
    const payloadSubTaskIds = action.task.subTaskIds ?? [];
    const movedTasks = tasks.filter(
      (task) =>
        task.id === action.task.id ||
        task.parentId === action.task.id ||
        payloadSubTaskIds.includes(task.id),
    );

    await Promise.all([
      ...movedTasks.map((task) => this.solidTaskRepository.saveTask(task)),
      ...projects.map((project) => this.solidProjectRepository.saveProject(project)),
      ...sections.map((section) => this.solidSectionRepository.saveSection(section)),
    ]);
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidTaskProjectMovePersistenceEffects: failed to persist project move', {
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
