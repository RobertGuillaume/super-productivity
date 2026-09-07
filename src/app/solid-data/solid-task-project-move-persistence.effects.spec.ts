import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT, INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { WorkContextType } from '../features/work-context/work-context.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTaskProjectMovePersistenceEffects } from './solid-task-project-move-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskProjectMovePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidSectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const rootTask: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'target-project',
    subTaskIds: ['sub-task-2'],
    created: 1710000000000,
  };
  const subTaskFromParent: Task = {
    ...DEFAULT_TASK,
    id: 'sub-task-1',
    parentId: 'task-1',
    projectId: 'target-project',
    created: 1710000000100,
  };
  const subTaskFromPayload: Task = {
    ...DEFAULT_TASK,
    id: 'sub-task-2',
    projectId: 'target-project',
    created: 1710000000200,
  };
  const unrelatedTask: Task = {
    ...DEFAULT_TASK,
    id: 'unrelated-task',
    projectId: INBOX_PROJECT.id,
    created: 1710000000300,
  };
  const sourceProject: Project = {
    ...DEFAULT_PROJECT,
    id: 'source-project',
    taskIds: ['unrelated-task'],
    backlogTaskIds: [],
  };
  const targetProject: Project = {
    ...DEFAULT_PROJECT,
    id: 'target-project',
    taskIds: ['task-1'],
    backlogTaskIds: [],
  };
  const sourceSection: Section = {
    id: 'source-section',
    contextId: 'source-project',
    contextType: WorkContextType.PROJECT,
    title: 'Source',
    isExpanded: true,
    taskIds: ['unrelated-task'],
  };
  const targetSection: Section = {
    id: 'target-section',
    contextId: 'target-project',
    contextType: WorkContextType.PROJECT,
    title: 'Target',
    isExpanded: true,
    taskIds: [],
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
    solidSectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['saveSection'],
    );
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskProjectMovePersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
        { provide: SolidSectionRepository, useValue: solidSectionRepository },
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

  it('persists moved tasks, projects, and sections from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(rootTask);
    solidProjectRepository.saveProject.and.resolveTo(sourceProject);
    solidSectionRepository.saveSection.and.resolveTo(sourceSection);
    store.select.and.callFake((selector) => {
      if (selector === selectAllTasks) {
        return of([rootTask, subTaskFromParent, subTaskFromPayload, unrelatedTask]);
      }
      if (selector === selectAllProjects) {
        return of([sourceProject, targetProject]);
      }
      if (selector === selectAllSections) {
        return of([sourceSection, targetSection]);
      }
      return of([]);
    });
    const effects = TestBed.inject(SolidTaskProjectMovePersistenceEffects);
    const subscription = effects.persistTaskProjectMove$.subscribe();

    actions$.next(
      TaskSharedActions.moveToOtherProject({
        task: {
          ...rootTask,
          projectId: 'source-project',
          subTasks: [],
        },
        targetProjectId: 'target-project',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectAllTasks],
      [selectAllProjects],
      [selectAllSections],
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledWith(rootTask);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledWith(subTaskFromParent);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledWith(subTaskFromPayload);
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalledWith(unrelatedTask);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledWith(sourceProject);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledWith(targetProject);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledWith(sourceSection);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledWith(targetSection);
    subscription.unsubscribe();
  });

  it('ignores project moves when Solid does not own the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskProjectMovePersistenceEffects);
    const subscription = effects.persistTaskProjectMove$.subscribe();

    actions$.next(createMoveAction());
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote project moves', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskProjectMovePersistenceEffects);
    const subscription = effects.persistTaskProjectMove$.subscribe();

    actions$.next({
      ...createMoveAction(),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  const createMoveAction = (): ReturnType<typeof TaskSharedActions.moveToOtherProject> =>
    TaskSharedActions.moveToOtherProject({
      task: {
        ...rootTask,
        projectId: 'source-project',
        subTasks: [],
      },
      targetProjectId: 'target-project',
    });
});
