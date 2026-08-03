import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectAllProjects } from '../features/project/store/project.selectors';
import { Section } from '../features/section/section.model';
import { selectAllSections } from '../features/section/store/section.selectors';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { DEFAULT_TASK, Task, TaskWithSubTasks } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { WorkContextType } from '../features/work-context/work-context.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskArchiveLifecyclePersistenceEffects } from './solid-task-archive-lifecycle-persistence.effects';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskArchiveLifecyclePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidArchivedTaskRepository: jasmine.SpyObj<SolidArchivedTaskRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidSectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const subTask: Task = {
    ...DEFAULT_TASK,
    id: 'sub-task-1',
    title: 'Archived subtask',
    projectId: 'project-1',
    parentId: 'task-1',
    created: 1710000000001,
  };
  const task: TaskWithSubTasks = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Archived parent',
    projectId: 'project-1',
    subTaskIds: ['sub-task-1'],
    subTasks: [subTask],
    created: 1710000000000,
  };
  const restoredTask: Task = {
    ...task,
    isDone: false,
    doneOn: undefined,
  };
  const project: Project = {
    ...INBOX_PROJECT,
    id: 'project-1',
    title: 'Project',
    taskIds: ['task-1'],
  };
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Tag',
    created: 1710000000100,
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
    solidArchivedTaskRepository = jasmine.createSpyObj<SolidArchivedTaskRepository>(
      'SolidArchivedTaskRepository',
      ['saveArchivedTask', 'deleteArchivedTask'],
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
      ['saveSection'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask', 'deleteTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    solidArchivedTaskRepository.saveArchivedTask.and.callFake((savedTask) =>
      Promise.resolve(savedTask),
    );
    solidArchivedTaskRepository.deleteArchivedTask.and.resolveTo(undefined);
    solidProjectRepository.saveProject.and.callFake((savedProject) =>
      Promise.resolve(savedProject),
    );
    solidSectionRepository.saveSection.and.callFake((savedSection) =>
      Promise.resolve(savedSection),
    );
    solidTagRepository.saveTag.and.callFake((savedTag) => Promise.resolve(savedTag));
    solidTaskRepository.saveTask.and.callFake((savedTask) => Promise.resolve(savedTask));
    solidTaskRepository.deleteTask.and.resolveTo(undefined);

    store.select.and.callFake((selector: unknown) => {
      if (selector === selectAllTasks) return of([restoredTask, subTask]);
      if (selector === selectAllProjects) return of([project]);
      if (selector === selectAllTags) return of([tag]);
      if (selector === selectAllSections) return of([section]);
      return of([]);
    });

    TestBed.configureTestingModule({
      providers: [
        SolidTaskArchiveLifecyclePersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        {
          provide: SolidArchivedTaskRepository,
          useValue: solidArchivedTaskRepository,
        },
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

  it('persists archived tasks and deletes live task resources on moveToArchive', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    spyOn(Date, 'now').and.returnValue(1710000000999);
    const effects = TestBed.inject(SolidTaskArchiveLifecyclePersistenceEffects);
    const subscription = effects.persistTaskArchiveLifecycle$.subscribe();

    actions$.next(TaskSharedActions.moveToArchive({ tasks: [task] }));
    await Promise.resolve();

    expect(solidArchivedTaskRepository.saveArchivedTask.calls.allArgs()).toEqual([
      [
        jasmine.objectContaining({
          id: 'task-1',
          isDone: true,
          doneOn: 1710000000999,
          dueDay: undefined,
          dueWithTime: undefined,
          reminderId: undefined,
        }),
        'young',
      ],
      [
        jasmine.objectContaining({
          id: 'sub-task-1',
          isDone: true,
          doneOn: 1710000000999,
          parentId: 'task-1',
        }),
        'young',
      ],
    ]);
    expect(solidTaskRepository.deleteTask.calls.allArgs()).toEqual([
      ['task-1'],
      ['sub-task-1'],
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(section);
    subscription.unsubscribe();
  });

  it('deletes archive resources and saves post-reducer state on restoreTask', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskArchiveLifecyclePersistenceEffects);
    const subscription = effects.persistTaskArchiveLifecycle$.subscribe();

    actions$.next(TaskSharedActions.restoreTask({ task, subTasks: [subTask] }));
    await Promise.resolve();

    expect(solidArchivedTaskRepository.deleteArchivedTask.calls.allArgs()).toEqual([
      ['task-1'],
      ['sub-task-1'],
    ]);
    expect(solidTaskRepository.saveTask.calls.allArgs()).toEqual([
      [restoredTask],
      [subTask],
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(solidSectionRepository.saveSection).toHaveBeenCalledOnceWith(section);
    subscription.unsubscribe();
  });

  it('ignores remote lifecycle actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidTaskArchiveLifecyclePersistenceEffects);
    const subscription = effects.persistTaskArchiveLifecycle$.subscribe();

    actions$.next({
      ...TaskSharedActions.convertToSubTask({
        taskId: 'task-1',
        targetParentId: 'parent-1',
        afterTaskId: null,
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    expect(solidArchivedTaskRepository.saveArchivedTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
