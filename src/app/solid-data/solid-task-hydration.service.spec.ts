import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { ArchiveDbAdapter } from '../core/persistence/archive-db-adapter.service';
import {
  BoardCfg,
  BoardPanelCfgScheduledState,
  BoardPanelCfgTaskDoneState,
} from '../features/boards/boards.model';
import { DEFAULT_GLOBAL_CONFIG } from '../features/config/default-global-config.const';
import { GlobalConfigState } from '../features/config/global-config.model';
import { Metric } from '../features/metric/metric.model';
import { MenuTreeKind, MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import { Note } from '../features/note/note.model';
import { IssueProvider } from '../features/issue/issue.model';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { PlannerState } from '../features/planner/store/planner.reducer';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import { Section } from '../features/section/section.model';
import {
  SimpleCounter,
  SimpleCounterType,
} from '../features/simple-counter/simple-counter.model';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { AppDataComplete } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SolidArchiveState } from './solid-archive-state.mapper';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidArchivedTask } from './solid-archived-task.mapper';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SOLID_APP_STATE_ID, SolidAppState } from './solid-app-state.mapper';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidBoardRepository } from './solid-board.repository';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import {
  createSolidAppData,
  SolidTaskHydrationService,
} from './solid-task-hydration.service';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidMetricRepository } from './solid-metric.repository';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';
import { SolidProjectRepository } from './solid-project.repository';
import { solidRepositoryRead } from './solid-repository-read';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidTaskAccessService } from './solid-task-access.service';
import { solidCatalogReconciled } from './solid-catalog-reconciled.action';

describe('SolidTaskHydrationService', () => {
  const TODAY = '2026-08-04';
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Load me from Solid',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
  };
  const project: Project = {
    ...INBOX_PROJECT,
    id: 'project-1',
    title: 'Solid project',
    taskIds: ['task-1'],
  };
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Solid tag',
    created: 1710000000100,
    taskIds: ['task-1'],
  };
  const note: Note = {
    id: 'note-1',
    projectId: 'project-1',
    isPinnedToToday: true,
    content: 'Solid note',
    created: 1710000000200,
    modified: 1710000000300,
  };
  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Solid section',
    isExpanded: true,
    taskIds: ['task-1'],
  };
  const issueProvider: IssueProvider = {
    id: 'issue-provider-1',
    issueProviderKey: 'GITHUB',
    isEnabled: true,
    pluginId: 'github-issue-provider',
    pluginConfig: {
      repo: 'owner/repo',
    },
  };
  const taskRepeatCfg: TaskRepeatCfg = {
    ...DEFAULT_TASK_REPEAT_CFG,
    id: 'repeat-cfg-1',
    projectId: 'project-1',
    title: 'Repeat from Solid',
    tagIds: ['tag-1'],
  };
  const simpleCounter: SimpleCounter = {
    id: 'counter-1',
    title: 'Solid counter',
    isEnabled: true,
    icon: 'timer',
    type: SimpleCounterType.StopWatch,
    countOnDay: {
      [TODAY]: 120000,
    },
    isOn: false,
  };
  const metric: Metric = {
    id: TODAY,
    focusSessions: [25],
    notes: 'Solid metric',
    remindTomorrow: true,
    reflections: [
      {
        text: 'Good rhythm',
        created: 1710000000700,
      },
    ],
  };
  const board: BoardCfg = {
    id: 'board-1',
    title: 'Solid board',
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
  const globalConfig: GlobalConfigState = {
    ...DEFAULT_GLOBAL_CONFIG,
    misc: {
      ...DEFAULT_GLOBAL_CONFIG.misc,
      isDisableAnimations: true,
    },
  };
  const menuTree: MenuTreeState = {
    projectTree: [
      {
        id: 'project-1',
        k: MenuTreeKind.PROJECT,
      },
    ],
    tagTree: [
      {
        id: 'tag-1',
        k: MenuTreeKind.TAG,
      },
    ],
  };
  const archivedYoungTask: Task = {
    ...task,
    id: 'archived-young-task-1',
    isDone: true,
    doneOn: 1710000000500,
  };
  const archivedOldTask: Task = {
    ...task,
    id: 'archived-old-task-1',
    isDone: true,
    doneOn: 1710000000600,
  };
  const archivedTasks: SolidArchivedTask[] = [
    {
      task: archivedOldTask,
      bucket: 'old',
    },
    {
      task: archivedYoungTask,
      bucket: 'young',
    },
  ];
  const archiveStates: {
    young: SolidArchiveState;
    old: SolidArchiveState;
  } = {
    young: {
      id: 'archive-young',
      bucket: 'young',
      timeTracking: {
        project: {
          ['project-1']: {
            ['2026-08-03']: {
              s: 1710000000000,
              e: 1710003600000,
            },
          },
        },
        tag: {},
      },
      lastTimeTrackingFlush: 1710000000000,
      updated: 1710000000100,
    },
    old: {
      id: 'archive-old',
      bucket: 'old',
      timeTracking: {
        project: {},
        tag: {
          ['tag-1']: {
            ['2026-07-01']: {
              s: 1700000000000,
              e: 1700003600000,
            },
          },
        },
      },
      lastTimeTrackingFlush: 1710000000200,
      updated: 1710000000300,
    },
  };
  const plannerState: PlannerState = {
    days: {
      ['2026-08-04']: ['task-1'],
    },
    addPlannedTasksDialogLastShown: '2026-08-04',
  };
  const timeTrackingState: TimeTrackingState = {
    project: {
      ['project-1']: {
        [TODAY]: {
          s: 1710000000000,
          e: 1710003600000,
        },
      },
    },
    tag: {},
  };
  const pluginUserData: PluginUserData = {
    id: 'plugin-a:doc-1',
    data: JSON.stringify({
      title: 'Plugin doc',
    }),
  };
  const pluginMetadata: PluginMetadata = {
    id: 'plugin-a',
    isEnabled: true,
  };
  const appState: SolidAppState = {
    id: SOLID_APP_STATE_ID,
    projectOrder: ['project-2', 'project-1'],
    tagOrder: ['tag-2', TODAY_TAG.id, 'tag-1'],
    noteTodayOrder: ['note-2', 'note-1'],
    sectionOrder: ['section-2', 'section-1'],
    updated: 1710000000400,
  };

  it('creates app data from Solid tasks, projects, and existing model defaults', () => {
    const appData = createSolidAppData({
      tasks: [task],
      archiveStates,
      boards: [board],
      globalConfig,
      menuTree,
      projects: [project],
      tags: [tag],
      notes: [note],
      sections: [section],
      issueProviders: [issueProvider],
      taskRepeatCfgs: [taskRepeatCfg],
      simpleCounters: [simpleCounter],
      metrics: [metric],
      archivedTasks,
      plannerState,
      pluginUserData: [pluginUserData],
      pluginMetadata: [pluginMetadata],
      timeTrackingState,
    });

    expect(appData.task.ids).toEqual(['task-1']);
    expect(appData.boards.boardCfgs).toEqual([board]);
    expect(appData.globalConfig.misc.isDisableAnimations).toBe(true);
    expect(appData.menuTree).toEqual(menuTree);
    expect(appData.task.entities['task-1']).toEqual(task);
    expect(appData.project.ids).toEqual([INBOX_PROJECT.id, 'project-1']);
    expect(appData.project.entities[INBOX_PROJECT.id]).toEqual(INBOX_PROJECT);
    expect(appData.project.entities['project-1']).toEqual(project);
    expect(appData.tag.ids).toEqual([TODAY_TAG.id, 'tag-1']);
    expect(appData.tag.entities[TODAY_TAG.id]).toEqual(TODAY_TAG);
    expect(appData.tag.entities['tag-1']).toEqual(tag);
    expect(appData.note.ids).toEqual(['note-1']);
    expect(appData.note.entities['note-1']).toEqual(note);
    expect(appData.note.todayOrder).toEqual(['note-1']);
    expect(appData.section.ids).toEqual(['section-1']);
    expect(appData.section.entities['section-1']).toEqual(section);
    expect(appData.issueProvider.ids).toEqual(['issue-provider-1']);
    expect(appData.issueProvider.entities['issue-provider-1']).toEqual(issueProvider);
    expect(appData.taskRepeatCfg.ids).toEqual(['repeat-cfg-1']);
    expect(appData.taskRepeatCfg.entities['repeat-cfg-1']).toEqual(taskRepeatCfg);
    expect(appData.simpleCounter.ids).toEqual(['counter-1']);
    expect(appData.simpleCounter.entities['counter-1']).toEqual(simpleCounter);
    expect(appData.metric.ids).toEqual([TODAY]);
    expect(appData.metric.entities[TODAY]).toEqual(metric);
    expect(appData.pluginUserData).toEqual([pluginUserData]);
    expect(appData.pluginMetadata).toEqual([pluginMetadata]);
    expect(appData.timeTracking).toEqual(timeTrackingState);
    expect(appData.archiveYoung.task.ids).toEqual(['archived-young-task-1']);
    expect(appData.archiveYoung.task.entities['archived-young-task-1']).toEqual(
      archivedYoungTask,
    );
    expect(appData.archiveYoung.timeTracking).toEqual(archiveStates.young.timeTracking);
    expect(appData.archiveYoung.lastTimeTrackingFlush).toBe(
      archiveStates.young.lastTimeTrackingFlush,
    );
    expect(appData.archiveOld.task.ids).toEqual(['archived-old-task-1']);
    expect(appData.archiveOld.task.entities['archived-old-task-1']).toEqual(
      archivedOldTask,
    );
    expect(appData.archiveOld.timeTracking).toEqual(archiveStates.old.timeTracking);
    expect(appData.archiveOld.lastTimeTrackingFlush).toBe(
      archiveStates.old.lastTimeTrackingFlush,
    );
    expect(appData.planner).toEqual(plannerState);
    expect(appData.reminders).toEqual([]);
  });

  it('applies Solid app-state ordering while preserving missing entities', () => {
    const project2: Project = {
      ...project,
      id: 'project-2',
    };
    const project3: Project = {
      ...project,
      id: 'project-3',
    };
    const tag2: Tag = {
      ...tag,
      id: 'tag-2',
    };
    const note2: Note = {
      ...note,
      id: 'note-2',
    };
    const note3: Note = {
      ...note,
      id: 'note-3',
    };
    const section2: Section = {
      ...section,
      id: 'section-2',
    };
    const section3: Section = {
      ...section,
      id: 'section-3',
    };

    const appData = createSolidAppData({
      tasks: [task],
      projects: [project, project3, project2],
      tags: [tag, tag2],
      notes: [note, note3, note2],
      sections: [section, section3, section2],
      appState,
    });

    expect(appData.project.ids).toEqual([
      INBOX_PROJECT.id,
      'project-2',
      'project-1',
      'project-3',
    ]);
    expect(appData.tag.ids).toEqual(['tag-2', TODAY_TAG.id, 'tag-1']);
    expect(appData.note.todayOrder).toEqual(['note-2', 'note-1', 'note-3']);
    expect(appData.section.ids).toEqual(['section-2', 'section-1', 'section-3']);
  });

  it('dispatches a complete snapshot despite malformed model and archive cache failures', async () => {
    const store = jasmine.createSpyObj<Store>('Store', ['dispatch']);
    const archiveDbAdapter = jasmine.createSpyObj<ArchiveDbAdapter>('ArchiveDbAdapter', [
      'saveArchivesAtomic',
    ]);
    const archiveStateRepository = jasmine.createSpyObj<SolidArchiveStateRepository>(
      'SolidArchiveStateRepository',
      ['loadArchiveStates'],
    );
    const taskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['loadTasks'],
    );
    const archivedTaskRepository = jasmine.createSpyObj<SolidArchivedTaskRepository>(
      'SolidArchivedTaskRepository',
      ['loadArchivedTasks'],
    );
    const boardRepository = jasmine.createSpyObj<SolidBoardRepository>(
      'SolidBoardRepository',
      ['loadBoards'],
    );
    const globalConfigRepository = jasmine.createSpyObj<SolidGlobalConfigRepository>(
      'SolidGlobalConfigRepository',
      ['loadGlobalConfig'],
    );
    const menuTreeRepository = jasmine.createSpyObj<SolidMenuTreeRepository>(
      'SolidMenuTreeRepository',
      ['loadMenuTree'],
    );
    const projectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['loadProjects'],
    );
    const plannerRepository = jasmine.createSpyObj<SolidPlannerRepository>(
      'SolidPlannerRepository',
      ['loadPlannerState'],
    );
    const pluginDataRepository = jasmine.createSpyObj<SolidPluginDataRepository>(
      'SolidPluginDataRepository',
      ['loadPluginUserData', 'loadPluginMetadata'],
    );
    const tagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'loadTags',
    ]);
    const noteRepository = jasmine.createSpyObj<SolidNoteRepository>(
      'SolidNoteRepository',
      ['loadNotes'],
    );
    const sectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['loadSections'],
    );
    const issueProviderRepository = jasmine.createSpyObj<SolidIssueProviderRepository>(
      'SolidIssueProviderRepository',
      ['loadIssueProviders'],
    );
    const taskRepeatCfgRepository = jasmine.createSpyObj<SolidTaskRepeatCfgRepository>(
      'SolidTaskRepeatCfgRepository',
      ['loadTaskRepeatCfgs'],
    );
    const simpleCounterRepository = jasmine.createSpyObj<SolidSimpleCounterRepository>(
      'SolidSimpleCounterRepository',
      ['loadSimpleCounters'],
    );
    const metricRepository = jasmine.createSpyObj<SolidMetricRepository>(
      'SolidMetricRepository',
      ['loadMetrics'],
    );
    const appStateRepository = jasmine.createSpyObj<SolidAppStateRepository>(
      'SolidAppStateRepository',
      ['loadAppState'],
    );
    const timeTrackingRepository = jasmine.createSpyObj<SolidTimeTrackingRepository>(
      'SolidTimeTrackingRepository',
      ['loadTimeTrackingState'],
    );
    const dataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['addDiagnostics', 'setPhase'],
    );
    const solidRuntime = jasmine.createSpyObj<SolidRuntimeService>(
      'SolidRuntimeService',
      ['ensureLayout'],
    );
    solidRuntime.ensureLayout.and.returnValue({
      containers: {
        tasks: 'https://pod.example/tasks/',
        archiveState: 'https://pod.example/archive-state/',
        archivedTasks: 'https://pod.example/archived-tasks/',
        boards: 'https://pod.example/boards/',
        config: 'https://pod.example/config/',
        menuTree: 'https://pod.example/menu-tree/',
        projects: 'https://pod.example/projects/',
        tags: 'https://pod.example/tags/',
        notes: 'https://pod.example/notes/',
        sections: 'https://pod.example/sections/',
        issueProviders: 'https://pod.example/issue-providers/',
        taskRepeatCfgs: 'https://pod.example/task-repeat-cfgs/',
        simpleCounters: 'https://pod.example/simple-counters/',
        metrics: 'https://pod.example/metrics/',
        planner: 'https://pod.example/planner/',
        pluginUserData: 'https://pod.example/plugin-user-data/',
        pluginMetadata: 'https://pod.example/plugin-metadata/',
        app: 'https://pod.example/app/',
        timeTracking: 'https://pod.example/time-tracking/',
      },
      types: {},
    });
    const catalogAuthority = jasmine.createSpyObj<SolidCatalogAuthorityService>(
      'SolidCatalogAuthorityService',
      ['isAuthoritative'],
    );
    catalogAuthority.isAuthoritative.and.returnValue(false);
    const taskAccess = jasmine.createSpyObj<SolidTaskAccessService>(
      'SolidTaskAccessService',
      ['isAppOwned'],
    );
    taskAccess.isAppOwned.and.returnValue(false);
    archiveDbAdapter.saveArchivesAtomic.and.rejectWith(
      new Error('archive cache unavailable'),
    );
    archiveStateRepository.loadArchiveStates.and.resolveTo(
      solidRepositoryRead(archiveStates),
    );
    taskRepository.loadTasks.and.resolveTo(solidRepositoryRead([task]));
    archivedTaskRepository.loadArchivedTasks.and.resolveTo(
      solidRepositoryRead(archivedTasks),
    );
    boardRepository.loadBoards.and.resolveTo(solidRepositoryRead([board]));
    globalConfigRepository.loadGlobalConfig.and.resolveTo(
      solidRepositoryRead(globalConfig),
    );
    menuTreeRepository.loadMenuTree.and.resolveTo(solidRepositoryRead(menuTree));
    projectRepository.loadProjects.and.resolveTo(solidRepositoryRead([project]));
    tagRepository.loadTags.and.resolveTo(solidRepositoryRead([tag]));
    noteRepository.loadNotes.and.resolveTo(solidRepositoryRead([note]));
    sectionRepository.loadSections.and.resolveTo(solidRepositoryRead([section]));
    issueProviderRepository.loadIssueProviders.and.resolveTo(
      solidRepositoryRead([issueProvider]),
    );
    taskRepeatCfgRepository.loadTaskRepeatCfgs.and.resolveTo(
      solidRepositoryRead([taskRepeatCfg]),
    );
    simpleCounterRepository.loadSimpleCounters.and.resolveTo(
      solidRepositoryRead([simpleCounter]),
    );
    metricRepository.loadMetrics.and.rejectWith(new TypeError('malformed metric'));
    plannerRepository.loadPlannerState.and.resolveTo(solidRepositoryRead(plannerState));
    pluginDataRepository.loadPluginUserData.and.resolveTo(
      solidRepositoryRead([pluginUserData]),
    );
    pluginDataRepository.loadPluginMetadata.and.resolveTo(
      solidRepositoryRead([pluginMetadata]),
    );
    appStateRepository.loadAppState.and.resolveTo(solidRepositoryRead(appState));
    timeTrackingRepository.loadTimeTrackingState.and.resolveTo(
      solidRepositoryRead(timeTrackingState),
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: ArchiveDbAdapter, useValue: archiveDbAdapter },
        { provide: SolidDataLayerStateService, useValue: dataLayerState },
        { provide: SolidRuntimeService, useValue: solidRuntime },
        { provide: SolidCatalogAuthorityService, useValue: catalogAuthority },
        { provide: SolidTaskAccessService, useValue: taskAccess },
        { provide: SolidArchiveStateRepository, useValue: archiveStateRepository },
        { provide: SolidTaskRepository, useValue: taskRepository },
        { provide: SolidArchivedTaskRepository, useValue: archivedTaskRepository },
        { provide: SolidBoardRepository, useValue: boardRepository },
        { provide: SolidGlobalConfigRepository, useValue: globalConfigRepository },
        { provide: SolidMenuTreeRepository, useValue: menuTreeRepository },
        { provide: SolidProjectRepository, useValue: projectRepository },
        { provide: SolidPlannerRepository, useValue: plannerRepository },
        { provide: SolidPluginDataRepository, useValue: pluginDataRepository },
        { provide: SolidTagRepository, useValue: tagRepository },
        { provide: SolidNoteRepository, useValue: noteRepository },
        { provide: SolidSectionRepository, useValue: sectionRepository },
        { provide: SolidIssueProviderRepository, useValue: issueProviderRepository },
        { provide: SolidTaskRepeatCfgRepository, useValue: taskRepeatCfgRepository },
        { provide: SolidSimpleCounterRepository, useValue: simpleCounterRepository },
        { provide: SolidMetricRepository, useValue: metricRepository },
        { provide: SolidAppStateRepository, useValue: appStateRepository },
        { provide: SolidTimeTrackingRepository, useValue: timeTrackingRepository },
      ],
    });

    const service = TestBed.inject(SolidTaskHydrationService);

    await service.hydrateStore();

    const action = store.dispatch.calls.mostRecent().args[0] as unknown as ReturnType<
      typeof loadAllData
    >;
    expect(action.type).toBe(loadAllData.type);
    expect(action.appDataComplete.task.ids).toEqual(['task-1']);
    expect(action.appDataComplete.boards.boardCfgs).toEqual([board]);
    expect(action.appDataComplete.globalConfig.misc.isDisableAnimations).toBe(true);
    expect(action.appDataComplete.menuTree).toEqual(menuTree);
    expect(action.appDataComplete.task.entities['task-1']).toEqual(task);
    expect(action.appDataComplete.project.ids).toEqual([INBOX_PROJECT.id, 'project-1']);
    expect(action.appDataComplete.project.entities['project-1']).toEqual(project);
    expect(action.appDataComplete.tag.ids).toEqual([TODAY_TAG.id, 'tag-1']);
    expect(action.appDataComplete.tag.entities['tag-1']).toEqual(tag);
    expect(action.appDataComplete.note.ids).toEqual(['note-1']);
    expect(action.appDataComplete.note.entities['note-1']).toEqual(note);
    expect(action.appDataComplete.note.todayOrder).toEqual(['note-1']);
    expect(action.appDataComplete.section.ids).toEqual(['section-1']);
    expect(action.appDataComplete.section.entities['section-1']).toEqual(section);
    expect(action.appDataComplete.issueProvider.ids).toEqual(['issue-provider-1']);
    expect(action.appDataComplete.issueProvider.entities['issue-provider-1']).toEqual(
      issueProvider,
    );
    expect(action.appDataComplete.taskRepeatCfg.ids).toEqual(['repeat-cfg-1']);
    expect(action.appDataComplete.taskRepeatCfg.entities['repeat-cfg-1']).toEqual(
      taskRepeatCfg,
    );
    expect(action.appDataComplete.simpleCounter.ids).toEqual(['counter-1']);
    expect(action.appDataComplete.simpleCounter.entities['counter-1']).toEqual(
      simpleCounter,
    );
    expect(action.appDataComplete.metric.ids).toEqual([]);
    const appDataComplete = action.appDataComplete as AppDataComplete;
    expect(appDataComplete.pluginUserData).toEqual([pluginUserData]);
    expect(appDataComplete.pluginMetadata).toEqual([pluginMetadata]);
    expect(appDataComplete.timeTracking).toEqual(timeTrackingState);
    expect(appDataComplete.archiveYoung.task.ids).toEqual(['archived-young-task-1']);
    expect(appDataComplete.archiveOld.task.ids).toEqual(['archived-old-task-1']);
    expect(appDataComplete.archiveYoung.timeTracking).toEqual(
      archiveStates.young.timeTracking,
    );
    expect(appDataComplete.archiveOld.timeTracking).toEqual(
      archiveStates.old.timeTracking,
    );
    expect(archiveDbAdapter.saveArchivesAtomic).toHaveBeenCalledOnceWith(
      appDataComplete.archiveYoung,
      appDataComplete.archiveOld,
    );
    expect(appDataComplete.planner).toEqual(plannerState);
    expect(archiveStateRepository.loadArchiveStates).toHaveBeenCalledTimes(1);
    expect(archivedTaskRepository.loadArchivedTasks).toHaveBeenCalledTimes(1);
    expect(boardRepository.loadBoards).toHaveBeenCalledTimes(1);
    expect(globalConfigRepository.loadGlobalConfig).toHaveBeenCalledTimes(1);
    expect(menuTreeRepository.loadMenuTree).toHaveBeenCalledTimes(1);
    expect(plannerRepository.loadPlannerState).toHaveBeenCalledTimes(1);
    expect(pluginDataRepository.loadPluginUserData).toHaveBeenCalledTimes(1);
    expect(pluginDataRepository.loadPluginMetadata).toHaveBeenCalledTimes(1);
    expect(sectionRepository.loadSections).toHaveBeenCalledTimes(1);
    expect(issueProviderRepository.loadIssueProviders).toHaveBeenCalledTimes(1);
    expect(taskRepeatCfgRepository.loadTaskRepeatCfgs).toHaveBeenCalledTimes(1);
    expect(simpleCounterRepository.loadSimpleCounters).toHaveBeenCalledTimes(1);
    expect(metricRepository.loadMetrics).toHaveBeenCalledTimes(1);
    expect(appStateRepository.loadAppState).toHaveBeenCalledTimes(1);
    expect(timeTrackingRepository.loadTimeTrackingState).toHaveBeenCalledTimes(1);
    expect(dataLayerState.addDiagnostics.calls.count()).toBe(2);
    expect(dataLayerState.addDiagnostics).toHaveBeenCalledWith(1);
    expect(dataLayerState.setPhase).toHaveBeenCalledWith('degraded');

    taskRepository.loadTasks.and.rejectWith(new TypeError('malformed task'));
    noteRepository.loadNotes.and.resolveTo(
      solidRepositoryRead([{ ...note, id: 'note-2' }]),
    );
    await service.reconcileStore();

    const partialAction = store.dispatch.calls.mostRecent()
      .args[0] as unknown as ReturnType<typeof solidCatalogReconciled>;
    expect(partialAction.type).toBe(solidCatalogReconciled.type);
    expect(partialAction.appDataComplete.task.ids).toEqual(['task-1']);
    expect(partialAction.appDataComplete.note.ids).toEqual(['note-1', 'note-2']);

    catalogAuthority.isAuthoritative.and.callFake(
      (containerUri) => containerUri === 'https://pod.example/notes/',
    );
    noteRepository.loadNotes.and.resolveTo(solidRepositoryRead([]));
    await service.reconcileStore();

    const authoritativeAction = store.dispatch.calls.mostRecent()
      .args[0] as unknown as ReturnType<typeof solidCatalogReconciled>;
    expect(authoritativeAction.appDataComplete.note.ids).toEqual([]);
  });
});
