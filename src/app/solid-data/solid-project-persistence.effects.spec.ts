import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import {
  addProject,
  archiveProject,
  moveProjectTaskToBacklogList,
  moveProjectTaskToRegularListAuto,
  updateProject,
} from '../features/project/store/project.actions';
import { selectProjectById } from '../features/project/store/project.selectors';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectPersistenceEffects } from './solid-project-persistence.effects';
import { SolidProjectRepository } from './solid-project.repository';

describe('SolidProjectPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  const project: Project = {
    ...DEFAULT_PROJECT,
    id: 'project-1',
    title: 'Persist project to Solid',
    taskIds: ['task-1'],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidProjectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['saveProject'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidProjectPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists project creates to Solid when the Solid data layer owns the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(project);
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectCreate$.subscribe();

    actions$.next(addProject({ project }));
    await Promise.resolve();

    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(snackService.open).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores project creates when the Solid data layer does not own the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectCreate$.subscribe();

    actions$.next(addProject({ project }));
    await Promise.resolve();

    expect(solidProjectRepository.saveProject).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists project updates with the full post-reducer project', async () => {
    const updatedProject: Project = {
      ...project,
      title: 'Updated in store',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(updatedProject);
    store.select.and.returnValue(of(updatedProject));
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectUpdate$.subscribe();

    actions$.next(
      updateProject({
        project: {
          id: project.id,
          changes: {
            title: updatedProject.title,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select).toHaveBeenCalledTimes(1);
    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(updatedProject);
    subscription.unsubscribe();
  });

  it('persists project status actions from the post-reducer project', async () => {
    const archivedProject: Project = {
      ...project,
      isArchived: true,
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(archivedProject);
    store.select.and.returnValue(of(archivedProject));
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectUpdate$.subscribe();

    actions$.next(archiveProject({ id: project.id }));
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(archivedProject);
    subscription.unsubscribe();
  });

  it('persists project task-list moves with the full post-reducer project', async () => {
    const movedProject: Project = {
      ...project,
      taskIds: ['task-2'],
      backlogTaskIds: ['task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(movedProject);
    store.select.and.returnValue(of(movedProject));
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectUpdate$.subscribe();

    actions$.next(
      moveProjectTaskToBacklogList({
        taskId: 'task-1',
        afterTaskId: null,
        workContextId: 'project-1',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(movedProject);
    subscription.unsubscribe();
  });

  it('persists auto project task-list moves by project id', async () => {
    const movedProject: Project = {
      ...project,
      taskIds: ['task-1', 'task-2'],
      backlogTaskIds: [],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(movedProject);
    store.select.and.returnValue(of(movedProject));
    const effects = TestBed.inject(SolidProjectPersistenceEffects);
    const subscription = effects.persistProjectUpdate$.subscribe();

    actions$.next(
      moveProjectTaskToRegularListAuto({
        taskId: 'task-1',
        projectId: 'project-1',
        isMoveToTop: true,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(movedProject);
    subscription.unsubscribe();
  });
});
