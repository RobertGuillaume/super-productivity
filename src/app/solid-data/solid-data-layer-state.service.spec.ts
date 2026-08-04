import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { ActionType, OpType } from '../op-log/core/operation.types';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import {
  BoardCfg,
  BoardPanelCfgScheduledState,
  BoardPanelCfgTaskDoneState,
} from '../features/boards/boards.model';
import {
  compressArchive,
  flushYoungToOld,
} from '../features/archive/store/archive.actions';
import { addBoard, updatePanelCfg } from '../features/boards/store/boards.actions';
import { updateGlobalConfigSection } from '../features/config/store/global-config.actions';
import { updateProjectTree } from '../features/menu-tree/store/menu-tree.actions';
import { MenuTreeKind } from '../features/menu-tree/store/menu-tree.model';
import {
  deletePluginMetadata,
  deletePluginUserData,
  upsertPluginMetadata,
  upsertPluginUserData,
} from '../plugins/store/plugin.actions';
import { moveProjectTaskToBacklogList } from '../features/project/store/project.actions';
import { PlannerActions } from '../features/planner/store/planner.actions';
import { IssueProviderActions } from '../features/issue/store/issue-provider.actions';
import { logFocusSession } from '../features/metric/store/metric.actions';
import {
  SimpleCounter,
  SimpleCounterType,
} from '../features/simple-counter/simple-counter.model';
import { addSimpleCounter } from '../features/simple-counter/store/simple-counter.actions';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import {
  addTaskRepeatCfgToTask,
  deleteTaskRepeatCfg,
  deleteTaskRepeatCfgInstance,
  deleteTaskRepeatCfgs,
  updateTaskRepeatCfg,
  updateTaskRepeatCfgs,
} from '../features/task-repeat-cfg/store/task-repeat-cfg.actions';
import {
  __updateMultipleTaskSimple,
  addSubTask,
  moveSubTask,
  moveSubTaskDown,
  moveSubTaskToBottom,
  moveSubTaskToTop,
  moveSubTaskUp,
  removeTimeSpent,
  roundTimeSpentForDay,
  updateTaskUi,
} from '../features/tasks/store/task.actions';
import {
  addTaskAttachment,
  deleteTaskAttachment,
  updateTaskAttachment,
} from '../features/tasks/task-attachment/task-attachment.actions';
import {
  syncTimeSpent,
  syncTimeTracking,
  updateWorkContextData,
} from '../features/time-tracking/store/time-tracking.actions';
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
    const taskRepeatCfg: TaskRepeatCfg = {
      ...DEFAULT_TASK_REPEAT_CFG,
      id: 'repeat-cfg-1',
      projectId: 'project-1',
      title: 'Repeat',
      tagIds: ['tag-1'],
    };
    const simpleCounter: SimpleCounter = {
      id: 'counter-1',
      title: 'Counter',
      isEnabled: true,
      icon: 'timer',
      type: SimpleCounterType.StopWatch,
      countOnDay: {},
      isOn: false,
    };
    const board: BoardCfg = {
      id: 'board-1',
      title: 'Board',
      cols: 1,
      panels: [
        {
          id: 'panel-1',
          title: 'Panel',
          taskIds: ['task-1'],
          includedTagIds: [],
          excludedTagIds: [],
          taskDoneState: BoardPanelCfgTaskDoneState.All,
          scheduledState: BoardPanelCfgScheduledState.All,
          isParentTasksOnly: false,
          projectIds: ['project-1'],
        },
      ],
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
    expect(service.ownsPersistentAction(addBoard({ board }) as PersistentAction)).toBe(
      true,
    );
    expect(
      service.ownsPersistentAction(
        updatePanelCfg({ panelCfg: board.panels[0] }) as PersistentAction,
      ),
    ).toBe(false);
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
    expect(
      service.ownsPersistentAction(
        addTaskRepeatCfgToTask({
          taskId: 'task-1',
          taskRepeatCfg,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateTaskRepeatCfg({
          taskRepeatCfg: {
            id: 'repeat-cfg-1',
            changes: {
              isPaused: true,
            },
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateTaskRepeatCfgs({
          ids: ['repeat-cfg-1'],
          changes: {
            isPaused: true,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deleteTaskRepeatCfgInstance({
          repeatCfgId: 'repeat-cfg-1',
          dateStr: '2026-08-03',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deleteTaskRepeatCfg({ id: 'repeat-cfg-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deleteTaskRepeatCfgs({ ids: ['repeat-cfg-1'] }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.deleteTaskRepeatCfg({
          taskRepeatCfgId: 'repeat-cfg-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        addSimpleCounter({ simpleCounter }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        logFocusSession({
          day: '2026-08-04',
          duration: 25,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        upsertPluginUserData({
          pluginUserData: {
            id: 'plugin-a:doc-1',
            data: 'payload',
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deletePluginUserData({ pluginId: 'plugin-a:doc-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        upsertPluginMetadata({
          pluginMetadata: {
            id: 'plugin-a',
            isEnabled: true,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deletePluginMetadata({ pluginId: 'plugin-a' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateGlobalConfigSection({
          sectionKey: 'misc',
          sectionCfg: {
            isDisableAnimations: true,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateProjectTree({
          tree: [
            {
              id: 'project-1',
              k: MenuTreeKind.PROJECT,
            },
          ],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        __updateMultipleTaskSimple({
          taskUpdates: [
            {
              id: 'task-1',
              changes: {
                title: 'Updated',
              },
            },
          ],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateTaskUi({
          task: {
            id: 'task-1',
            changes: {
              _hideSubTasksMode: 1,
            },
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveSubTask({
          taskId: 'task-1',
          srcTaskId: 'parent-1',
          targetTaskId: 'target-parent-1',
          afterTaskId: null,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveSubTaskUp({ id: 'task-1', parentId: 'parent-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveSubTaskDown({ id: 'task-1', parentId: 'parent-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveSubTaskToTop({ id: 'task-1', parentId: 'parent-1' }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        moveSubTaskToBottom({
          id: 'task-1',
          parentId: 'parent-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        removeTimeSpent({
          id: 'task-1',
          date: '2026-08-03',
          duration: 1000,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        addSubTask({
          task: {
            ...task,
            id: 'sub-task-1',
          },
          parentId: 'task-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        roundTimeSpentForDay({
          day: '2026-08-03',
          taskIds: ['task-1'],
          roundTo: 'QUARTER',
          isRoundUp: true,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        addTaskAttachment({
          taskId: 'task-1',
          taskAttachment: {
            id: 'attachment-1',
            type: 'LINK',
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateTaskAttachment({
          taskId: 'task-1',
          taskAttachment: {
            id: 'attachment-1',
            changes: {
              title: 'Updated attachment',
            },
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        deleteTaskAttachment({
          taskId: 'task-1',
          id: 'attachment-1',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        syncTimeSpent({
          taskId: 'task-1',
          date: '2026-08-03',
          duration: 1000,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        updateWorkContextData({
          ctx: {
            id: 'project-1',
            type: WorkContextType.PROJECT,
          },
          date: '2026-08-03',
          updates: {
            e: 1710000000000,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        syncTimeTracking({
          contextType: 'TAG',
          contextId: 'tag-1',
          date: '2026-08-03',
          data: {
            e: 1710000000000,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.moveToArchive({
          tasks: [
            {
              ...task,
              subTasks: [],
            },
          ],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        flushYoungToOld({ timestamp: 1710000000000 }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        compressArchive({
          timestamp: 1710000000000,
          oneYearAgoTimestamp: 1678464000000,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.restoreTask({
          task: {
            ...task,
            subTasks: [],
          },
          subTasks: [],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.restoreDeletedTask({
          task: {
            ...task,
            subTasks: [],
          },
          tagTaskIdMap: {
            ['tag-1']: ['task-1'],
          },
          deletedTaskEntities: {
            ['task-1']: task,
          },
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.convertToSubTask({
          taskId: 'task-1',
          targetParentId: 'parent-1',
          afterTaskId: null,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        TaskSharedActions.convertToMainTask({
          task,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        PlannerActions.upsertPlannerDay({
          day: '2026-08-04',
          taskIds: ['task-1'],
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        PlannerActions.transferTask({
          task,
          prevDay: '2026-08-04',
          newDay: '2026-08-05',
          targetIndex: 0,
          today: '2026-08-04',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        PlannerActions.moveInList({
          targetDay: '2026-08-04',
          fromIndex: 0,
          toIndex: 1,
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        PlannerActions.moveBeforeTask({
          fromTask: task,
          toTaskId: 'task-2',
        }) as PersistentAction,
      ),
    ).toBe(true);
    expect(
      service.ownsPersistentAction(
        PlannerActions.planTaskForDay({
          task,
          day: '2026-08-04',
        }) as PersistentAction,
      ),
    ).toBe(true);
  });
});
