import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { ActionType, OpType } from '../op-log/core/operation.types';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { moveProjectTaskToBacklogList } from '../features/project/store/project.actions';
import { IssueProviderActions } from '../features/issue/store/issue-provider.actions';
import {
  addSection,
  addTaskToSection,
  deleteSection,
  removeTaskFromSection,
  updateSection,
  updateSectionOrder,
} from '../features/section/store/section.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { WorkContextType } from '../features/work-context/work-context.model';
import { moveTaskInTodayList } from '../features/work-context/store/work-context-meta.actions';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SOLID_DATA_LAYER_ENABLED_STORAGE_KEY } from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidDataLayerStateService', () => {
  let authState: AuthState;

  beforeEach(() => {
    authState = { status: 'anonymous' };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            client: {
              auth: {
                state: () => authState,
              },
            } as SolidRuntime,
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('is inactive unless the flag is enabled and the runtime is authenticated', () => {
    const service = TestBed.inject(SolidDataLayerStateService);

    expect(service.isActive()).toBe(false);

    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    expect(service.isActive()).toBe(false);

    authState = { status: 'authenticated', webId: 'https://user.example/#me' };
    expect(service.isActive()).toBe(true);
  });

  it('owns Solid-backed write actions only while active', () => {
    const service = TestBed.inject(SolidDataLayerStateService);
    const task: Task = {
      ...DEFAULT_TASK,
      id: 'task-1',
      projectId: 'project-1',
      created: 1710000000000,
    };
    const action = TaskSharedActions.addTask({
      task,
      workContextId: 'project-1',
      workContextType: WorkContextType.PROJECT,
      isAddToBacklog: false,
      isAddToBottom: false,
    }) as PersistentAction;

    expect(service.ownsPersistentAction(action)).toBe(false);

    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    authState = { status: 'authenticated', webId: 'https://user.example/#me' };

    expect(service.ownsPersistentAction(action)).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: TaskSharedActions.deleteTask.type,
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: TaskSharedActions.deleteTasks.type,
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TASK_SHARED_UPDATE,
        meta: {
          ...action.meta,
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TASK_SHARED_UPDATE_MULTIPLE,
        meta: {
          ...action.meta,
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.addTagToTask({
          taskId: 'task-1',
          tagId: 'tag-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.removeTagsForAllTasks({
          tagIdsToRemove: ['tag-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        addSection({
          section: {
            id: 'section-1',
            contextId: 'project-1',
            contextType: WorkContextType.PROJECT,
            title: 'Section',
            isExpanded: true,
            taskIds: ['task-1'],
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateSection({
          section: {
            id: 'section-1',
            changes: {
              title: 'Renamed',
            },
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateSectionOrder({
          contextId: 'project-1',
          ids: ['section-2', 'section-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        addTaskToSection({
          sectionId: 'section-1',
          taskId: 'task-1',
          afterTaskId: null,
          sourceSectionId: null,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        removeTaskFromSection({
          sectionId: 'section-1',
          taskId: 'task-1',
          workContextId: 'project-1',
          workContextType: WorkContextType.PROJECT,
          workContextAfterTaskId: null,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deleteSection({ id: 'section-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.moveToOtherProject({
          task: {
            ...task,
            projectId: 'source-project',
            subTasks: [],
          },
          targetProjectId: 'target-project',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.deleteProject({
          projectId: 'project-1',
          noteIds: ['note-1'],
          allTaskIds: ['task-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.scheduleTaskWithTime({
          task,
          dueWithTime: 1710000000500,
          remindAt: 1710000000500,
          isMoveToBacklog: false,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.reScheduleTaskWithTime({
          task,
          dueWithTime: 1710000000600,
          remindAt: 1710000000600,
          isMoveToBacklog: false,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.unscheduleTask({ id: 'task-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.dismissReminderOnly({ id: 'task-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.setDeadline({
          taskId: 'task-1',
          deadlineDay: '2026-08-03',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.planDeadlineTasksForToday({
          taskIds: ['task-1'],
          today: '2026-08-03',
          startOfNextDayDiffMs: 0,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.removeDeadline({ taskId: 'task-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.clearDeadlineReminder({
          taskId: 'task-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.applyShortSyntax({
          task,
          taskChanges: {
            title: 'Updated',
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.batchUpdateForProject({
          projectId: 'project-1',
          operations: [],
          createdTaskIds: {},
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.PROJECT_ADD,
        meta: {
          ...action.meta,
          entityType: 'PROJECT',
          opType: OpType.Create,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.PROJECT_UPDATE,
        meta: {
          ...action.meta,
          entityType: 'PROJECT',
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.PROJECT_UPDATE_ORDER,
        meta: {
          ...action.meta,
          entityType: 'PROJECT',
          opType: OpType.Move,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.PROJECT_ARCHIVE,
        meta: {
          ...action.meta,
          entityType: 'PROJECT',
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TAG_ADD,
        meta: {
          ...action.meta,
          entityType: 'TAG',
          opType: OpType.Create,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TAG_UPDATE,
        meta: {
          ...action.meta,
          entityType: 'TAG',
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TAG_UPDATE_ORDER,
        meta: {
          ...action.meta,
          entityType: 'TAG',
          opType: OpType.Move,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.TAG_DELETE,
        meta: {
          ...action.meta,
          entityType: 'TAG',
          opType: OpType.Delete,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.NOTE_UPDATE_ORDER,
        meta: {
          ...action.meta,
          entityType: 'NOTE',
          opType: OpType.Move,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.NOTE_ADD,
        meta: {
          ...action.meta,
          entityType: 'NOTE',
          opType: OpType.Create,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.NOTE_UPDATE,
        meta: {
          ...action.meta,
          entityType: 'NOTE',
          opType: OpType.Update,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction({
        ...action,
        type: ActionType.NOTE_DELETE,
        meta: {
          ...action.meta,
          entityType: 'NOTE',
          opType: OpType.Delete,
        },
      }),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveTaskInTodayList({
          taskId: 'task-1',
          afterTaskId: null,
          workContextType: WorkContextType.PROJECT,
          workContextId: 'project-1',
          src: 'UNDONE',
          target: 'UNDONE',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveProjectTaskToBacklogList({
          taskId: 'task-1',
          afterTaskId: null,
          workContextId: 'project-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.planTasksForToday({
          taskIds: ['task-1'],
          today: '2026-07-24',
          startOfNextDayDiffMs: 0,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        IssueProviderActions.addIssueProvider({
          issueProvider: {
            id: 'issue-provider-1',
            issueProviderKey: 'GITHUB',
            isEnabled: true,
            pluginId: 'github-issue-provider',
            pluginConfig: {},
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        IssueProviderActions.updateIssueProvider({
          issueProvider: {
            id: 'issue-provider-1',
            changes: {
              isEnabled: false,
            },
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        IssueProviderActions.sortIssueProvidersFirst({
          ids: ['issue-provider-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.deleteIssueProvider({
          issueProviderId: 'issue-provider-1',
          taskIdsToUnlink: ['task-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.deleteIssueProviders({
          ids: ['issue-provider-1'],
          taskIdsToUnlink: ['task-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
  });
});
