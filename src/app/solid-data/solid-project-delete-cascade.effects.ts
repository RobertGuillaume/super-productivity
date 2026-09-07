import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, forkJoin, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Note } from '../features/note/note.model';
import { selectNoteTodayOrder } from '../features/note/store/note.reducer';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidNoteRepository } from './solid-note.repository';
import {
  isSolidProjectDeleteAction,
  SolidProjectDeleteAction,
} from './solid-project-delete-action-types';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable()
export class SolidProjectDeleteCascadeEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidAppStateRepository = inject(SolidAppStateRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidNoteRepository = inject(SolidNoteRepository);
  private readonly solidProjectRepository = inject(SolidProjectRepository);
  private readonly solidSectionRepository = inject(SolidSectionRepository);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly solidTaskRepository = inject(SolidTaskRepository);
  private readonly snackService = inject(SnackService);

  persistProjectDeleteCascade$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidProjectDeleteAction & PersistentAction =>
            isSolidProjectDeleteAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          forkJoin({
            noteTodayOrder: this.store.select(selectNoteTodayOrder).pipe(take(1)),
            projects: this.store.select(selectAllProjects).pipe(take(1)),
            sections: this.store.select(selectAllSections).pipe(take(1)),
            tags: this.store.select(selectAllTags).pipe(take(1)),
          }).pipe(
            concatMap(({ noteTodayOrder, projects, sections, tags }) =>
              from(this.persistCascade(action, projects, tags, sections, noteTodayOrder)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistCascade(
    action: SolidProjectDeleteAction,
    projects: readonly Project[],
    tags: readonly Tag[],
    sections: readonly Section[],
    noteTodayOrder: readonly Note['id'][],
  ): Promise<void> {
    const solidSections = (await this.solidSectionRepository.loadSections()).value;
    const deletedProjectSectionIds = solidSections
      .filter(
        (section) =>
          section.contextType === WorkContextType.PROJECT &&
          section.contextId === action.projectId,
      )
      .map((section) => section.id);

    await Promise.all([
      this.solidProjectRepository.deleteProject(action.projectId),
      ...action.allTaskIds.map((taskId) => this.solidTaskRepository.deleteTask(taskId)),
      ...action.noteIds.map((noteId) => this.solidNoteRepository.deleteNote(noteId)),
      ...tags.map((tag) => this.solidTagRepository.saveTag(tag)),
      ...sections.map((section) => this.solidSectionRepository.saveSection(section)),
      ...deletedProjectSectionIds.map((sectionId) =>
        this.solidSectionRepository.deleteSection(sectionId),
      ),
      this.solidAppStateRepository.saveAppStateOrder({
        noteTodayOrder: [...noteTodayOrder],
        projectOrder: projects
          .filter((project) => project.id !== INBOX_PROJECT.id)
          .map((project) => project.id),
        sectionOrder: sections.map((section) => section.id),
      }),
    ]);
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidProjectDeleteCascadeEffects: failed to persist project delete',
    });
  }
}
