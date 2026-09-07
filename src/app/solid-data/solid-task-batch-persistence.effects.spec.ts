import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { BatchOperation } from '@super-productivity/plugin-api';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { WorkContextType } from '../features/work-context/work-context.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskBatchPersistenceEffects } from './solid-task-batch-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskBatchPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidSectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'project-1',
    created: 1710000000000,
  };
  const project: Project = {
    ...DEFAULT_PROJECT,
    id: 'project-1',
    taskIds: ['task-1'],
  };
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    taskIds: ['task-1'],
  };
  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Section',
    isExpanded: true,
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
    solidSectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['saveSection'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['deleteTask', 'saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTaskBatchPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
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

  it('persists post-reducer task, project, tag, and section snapshots for short syntax', async () => {
    setupPostReducerSelectors();
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidProjectRepository.saveProject.and.resolveTo(project);
    solidTagRepository.saveTag.and.resolveTo(tag);
    solidSectionRepository.saveSection.and.resolveTo(section);
    const effects = TestBed.inject(SolidTaskBatchPersistenceEffects);
    const subscription = effects.persistTaskBatch$.subscribe();

    actions$.next(
      TaskSharedActions.applyShortSyntax({
        task,
        taskChanges: {
          title: 'Updated',
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectAllProjects],
      [selectAllSections],
      [selectAllTags],
      [selectAllTasks],
    ]);
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(section);
    subscription.unsubscribe();
  });

  it('deletes removed task resources for batch project updates', async () => {
    setupPostReducerSelectors();
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTaskRepository.deleteTask.and.resolveTo();
    solidTaskRepository.saveTask.and.resolveTo(task);
    solidProjectRepository.saveProject.and.resolveTo(project);
    solidTagRepository.saveTag.and.resolveTo(tag);
    solidSectionRepository.saveSection.and.resolveTo(section);
    const effects = TestBed.inject(SolidTaskBatchPersistenceEffects);
    const subscription = effects.persistTaskBatch$.subscribe();

    actions$.next(
      TaskSharedActions.batchUpdateForProject({
        projectId: 'project-1',
        operations: [
          {
            type: 'delete',
            taskId: 'deleted-task',
          },
        ] as BatchOperation[],
        createdTaskIds: {},
      }),
    );
    await Promise.resolve();

    expect(solidTaskRepository.deleteTask).toHaveBeenCalledOnceWith('deleted-task');
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    subscription.unsubscribe();
  });

  it('ignores batch actions when Solid does not own them', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidTaskBatchPersistenceEffects);
    const subscription = effects.persistTaskBatch$.subscribe();

    actions$.next(
      TaskSharedActions.applyShortSyntax({
        task,
        taskChanges: {},
      }),
    );
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote batch actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskBatchPersistenceEffects);
    const subscription = effects.persistTaskBatch$.subscribe();

    actions$.next({
      ...TaskSharedActions.batchUpdateForProject({
        projectId: 'project-1',
        operations: [],
        createdTaskIds: {},
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  const setupPostReducerSelectors = (): void => {
    store.select.and.callFake((selector) => {
      if (selector === selectAllProjects) return of([project]);
      if (selector === selectAllSections) return of([section]);
      if (selector === selectAllTags) return of([tag]);
      if (selector === selectAllTasks) return of([task]);
      return of([]);
    });
  };
});
