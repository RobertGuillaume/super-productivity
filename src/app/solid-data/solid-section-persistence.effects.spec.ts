import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { Section, SectionState } from '../features/section/section.model';
import {
  addSection,
  addTaskToSection,
  deleteSection,
  removeTaskFromSection,
  updateSection,
  updateSectionOrder,
} from '../features/section/store/section.actions';
import { selectSectionFeatureState } from '../features/section/store/section.selectors';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionPersistenceEffects } from './solid-section-persistence.effects';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';

describe('SolidSectionPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidAppStateRepository: jasmine.SpyObj<SolidAppStateRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidSectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Solid section',
    isExpanded: true,
    taskIds: ['task-1'],
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
    solidProjectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['saveProject'],
    );
    solidSectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['deleteSection', 'saveSection'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidSectionPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidAppStateRepository, useValue: solidAppStateRepository },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
        { provide: SolidSectionRepository, useValue: solidSectionRepository },
        { provide: SolidTagRepository, useValue: solidTagRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists section creates to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSectionRepository.saveSection.and.resolveTo(section);
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionCreate$.subscribe();

    actions$.next(addSection({ section }));
    await Promise.resolve();

    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(section);
    expect(store.select).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists section updates with the full post-reducer section', async () => {
    const updatedSection: Section = {
      ...section,
      title: 'Updated in store',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSectionRepository.saveSection.and.resolveTo(updatedSection);
    store.select.and.returnValue(of(sectionStateOf([updatedSection])));
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionUpdate$.subscribe();

    actions$.next(
      updateSection({
        section: {
          id: 'section-1',
          changes: {
            title: 'Updated in payload',
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectSectionFeatureState,
    ]);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(updatedSection);
    subscription.unsubscribe();
  });

  it('persists source and target sections after task placement moves', async () => {
    const sourceSection: Section = {
      ...section,
      id: 'section-source',
      taskIds: [],
    };
    const targetSection: Section = {
      ...section,
      id: 'section-target',
      taskIds: ['task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSectionRepository.saveSection.and.resolveTo(targetSection);
    store.select.and.returnValue(of(sectionStateOf([sourceSection, targetSection])));
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionUpdate$.subscribe();

    actions$.next(
      addTaskToSection({
        sectionId: 'section-target',
        taskId: 'task-1',
        afterTaskId: null,
        sourceSectionId: 'section-source',
      }),
    );
    await Promise.resolve();

    expect(solidSectionRepository.saveSection).toHaveBeenCalledWith(sourceSection);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledWith(targetSection);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('persists section deletes through the section repository', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidSectionRepository.deleteSection.and.resolveTo();
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionDelete$.subscribe();

    actions$.next(deleteSection({ id: 'section-1' }));
    await Promise.resolve();

    expect(solidSectionRepository.deleteSection).toHaveBeenCalledOnceWith('section-1');
    subscription.unsubscribe();
  });

  it('persists section order from the full post-reducer section state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidAppStateRepository.saveAppStateOrder.and.resolveTo({
      id: 'super-productivity-app-state',
      projectOrder: [],
      sectionOrder: ['section-2', 'section-1'],
      tagOrder: [],
      noteTodayOrder: [],
      updated: 1710000000000,
    });
    store.select.and.returnValue(
      of({
        ids: ['section-2', 'section-1'],
        entities: {},
      } as SectionState),
    );
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionOrder$.subscribe();

    actions$.next(
      updateSectionOrder({
        contextId: 'project-1',
        ids: ['section-2', 'section-1'],
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectSectionFeatureState,
    ]);
    expect(solidAppStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      sectionOrder: ['section-2', 'section-1'],
    });
    subscription.unsubscribe();
  });

  it('persists the affected project when removing a task from a project section', async () => {
    const project: Project = {
      ...DEFAULT_PROJECT,
      id: 'project-1',
      taskIds: ['task-2', 'task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(project);
    store.select.and.returnValue(of(project));
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionWorkContext$.subscribe();

    actions$.next(
      removeTaskFromSection({
        sectionId: 'section-1',
        taskId: 'task-1',
        workContextId: 'project-1',
        workContextType: WorkContextType.PROJECT,
        workContextAfterTaskId: 'task-2',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(solidTagRepository.saveTag).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists the affected tag when removing a task from a tag section', async () => {
    const tag: Tag = {
      ...DEFAULT_TAG,
      id: 'tag-1',
      taskIds: ['task-2', 'task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(tag);
    store.select.and.returnValue(of(tag));
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionWorkContext$.subscribe();

    actions$.next(
      removeTaskFromSection({
        sectionId: 'section-1',
        taskId: 'task-1',
        workContextId: 'tag-1',
        workContextType: WorkContextType.TAG,
        workContextAfterTaskId: 'task-2',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: 'tag-1',
      },
    ]);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(solidProjectRepository.saveProject).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote section actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidSectionPersistenceEffects);
    const subscription = effects.persistSectionCreate$.subscribe();

    actions$.next({
      ...addSection({ section }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(solidSectionRepository.saveSection).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});

const sectionStateOf = (sections: Section[]): SectionState => ({
  ids: sections.map((section) => section.id),
  entities: Object.fromEntries(sections.map((section) => [section.id, section])),
});
