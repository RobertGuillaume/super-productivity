import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT, INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { selectNoteTodayOrder } from '../features/note/store/note.reducer';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidProjectDeleteCascadeEffects } from './solid-project-delete-cascade.effects';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidProjectDeleteCascadeEffects', () => {
  let actions$: Subject<Action>;
  let solidAppStateRepository: jasmine.SpyObj<SolidAppStateRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidNoteRepository: jasmine.SpyObj<SolidNoteRepository>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidSectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const remainingProject: Project = {
    ...DEFAULT_PROJECT,
    id: 'remaining-project',
  };
  const cleanedTodayTag: Tag = {
    ...TODAY_TAG,
    taskIds: ['kept-task'],
  };
  const cleanedCustomTag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    taskIds: [],
  };
  const remainingSection: Section = {
    id: 'remaining-section',
    contextId: TODAY_TAG.id,
    contextType: WorkContextType.TAG,
    title: 'Remaining',
    isExpanded: true,
    taskIds: ['kept-task'],
  };
  const deletedProjectSection: Section = {
    id: 'deleted-project-section',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Deleted project',
    isExpanded: true,
    taskIds: ['task-1'],
  };
  const unrelatedProjectSection: Section = {
    ...deletedProjectSection,
    id: 'unrelated-project-section',
    contextId: 'remaining-project',
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidAppStateRepository = jasmine.createSpyObj<SolidAppStateRepository>(
      'SolidAppStateRepository',
      ['saveAppStateOrder'],
    );
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidNoteRepository = jasmine.createSpyObj<SolidNoteRepository>(
      'SolidNoteRepository',
      ['deleteNote'],
    );
    solidProjectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['deleteProject'],
    );
    solidSectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['deleteSection', 'loadSections', 'saveSection'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['deleteTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidProjectDeleteCascadeEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidAppStateRepository, useValue: solidAppStateRepository },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidNoteRepository, useValue: solidNoteRepository },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
        { provide: SolidSectionRepository, useValue: solidSectionRepository },
        { provide: SolidTagRepository, useValue: solidTagRepository },
        { provide: SolidTaskRepository, useValue: solidTaskRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('deletes and updates the project cascade through Solid repositories', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.deleteProject.and.resolveTo();
    solidTaskRepository.deleteTask.and.resolveTo();
    solidNoteRepository.deleteNote.and.resolveTo();
    solidTagRepository.saveTag.and.resolveTo(cleanedTodayTag);
    solidSectionRepository.saveSection.and.resolveTo(remainingSection);
    solidSectionRepository.deleteSection.and.resolveTo();
    solidSectionRepository.loadSections.and.resolveTo([
      deletedProjectSection,
      unrelatedProjectSection,
    ]);
    solidAppStateRepository.saveAppStateOrder.and.resolveTo({
      id: 'super-productivity-app-state',
      projectOrder: ['remaining-project'],
      sectionOrder: ['remaining-section'],
      tagOrder: [],
      noteTodayOrder: ['kept-note'],
      updated: 1710000000000,
    });
    store.select.and.callFake((selector) => {
      if (selector === selectNoteTodayOrder) {
        return of(['kept-note']);
      }
      if (selector === selectAllProjects) {
        return of([INBOX_PROJECT, remainingProject]);
      }
      if (selector === selectAllSections) {
        return of([remainingSection]);
      }
      if (selector === selectAllTags) {
        return of([cleanedTodayTag, cleanedCustomTag]);
      }
      return of([]);
    });
    const effects = TestBed.inject(SolidProjectDeleteCascadeEffects);
    const subscription = effects.persistProjectDeleteCascade$.subscribe();

    actions$.next(createDeleteProjectAction());
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectNoteTodayOrder],
      [selectAllProjects],
      [selectAllSections],
      [selectAllTags],
    ]);
    expect(solidProjectRepository.deleteProject).toHaveBeenCalledOnceWith('project-1');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('task-1');
    expect(solidTaskRepository.deleteTask).toHaveBeenCalledWith('sub-task-1');
    expect(solidNoteRepository.deleteNote).toHaveBeenCalledOnceWith('note-1');
    expect(solidTagRepository.saveTag).toHaveBeenCalledWith(cleanedTodayTag);
    expect(solidTagRepository.saveTag).toHaveBeenCalledWith(cleanedCustomTag);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(remainingSection);
    expect(solidSectionRepository.deleteSection).toHaveBeenCalledOnceWith(
      'deleted-project-section',
    );
    expect(solidAppStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      noteTodayOrder: ['kept-note'],
      projectOrder: ['remaining-project'],
      sectionOrder: ['remaining-section'],
    });
    subscription.unsubscribe();
  });

  it('ignores delete project when Solid does not own the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidProjectDeleteCascadeEffects);
    const subscription = effects.persistProjectDeleteCascade$.subscribe();

    actions$.next(createDeleteProjectAction());
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidProjectRepository.deleteProject).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote delete project actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidProjectDeleteCascadeEffects);
    const subscription = effects.persistProjectDeleteCascade$.subscribe();

    actions$.next({
      ...createDeleteProjectAction(),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidProjectRepository.deleteProject).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  const createDeleteProjectAction = (): ReturnType<
    typeof TaskSharedActions.deleteProject
  > =>
    TaskSharedActions.deleteProject({
      projectId: 'project-1',
      noteIds: ['note-1'],
      allTaskIds: ['task-1', 'sub-task-1'],
    });
});
