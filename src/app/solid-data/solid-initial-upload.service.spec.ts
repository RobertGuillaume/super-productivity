import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { INBOX_PROJECT } from '../features/project/project.const';
import { DEFAULT_TASK, Task, TaskState } from '../features/tasks/task.model';
import { StateSnapshotService } from '../op-log/backup/state-snapshot.service';
import { AppDataComplete, MODEL_CONFIGS } from '../op-log/model/model-config';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { createDefaultSolidArchiveState } from './solid-archive-state.mapper';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidBoardRepository } from './solid-board.repository';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import {
  SOLID_INITIAL_UPLOAD_VALIDATE,
  SolidInitialUploadService,
  SolidInitialUploadValidationResult,
  SolidInitialUploadValidator,
} from './solid-initial-upload.service';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';
import { SolidMetricRepository } from './solid-metric.repository';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';

describe('SolidInitialUploadService', () => {
  let appStateRepository: jasmine.SpyObj<SolidAppStateRepository>;
  let archiveStateRepository: jasmine.SpyObj<SolidArchiveStateRepository>;
  let archivedTaskRepository: jasmine.SpyObj<SolidArchivedTaskRepository>;
  let boardRepository: jasmine.SpyObj<SolidBoardRepository>;
  let globalConfigRepository: jasmine.SpyObj<SolidGlobalConfigRepository>;
  let issueProviderRepository: jasmine.SpyObj<SolidIssueProviderRepository>;
  let menuTreeRepository: jasmine.SpyObj<SolidMenuTreeRepository>;
  let metricRepository: jasmine.SpyObj<SolidMetricRepository>;
  let noteRepository: jasmine.SpyObj<SolidNoteRepository>;
  let plannerRepository: jasmine.SpyObj<SolidPlannerRepository>;
  let pluginDataRepository: jasmine.SpyObj<SolidPluginDataRepository>;
  let projectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let sectionRepository: jasmine.SpyObj<SolidSectionRepository>;
  let simpleCounterRepository: jasmine.SpyObj<SolidSimpleCounterRepository>;
  let snapshotService: jasmine.SpyObj<StateSnapshotService>;
  let tagRepository: jasmine.SpyObj<SolidTagRepository>;
  let taskRepeatCfgRepository: jasmine.SpyObj<SolidTaskRepeatCfgRepository>;
  let taskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let timeTrackingRepository: jasmine.SpyObj<SolidTimeTrackingRepository>;
  let validateSnapshot: jasmine.Spy<SolidInitialUploadValidator>;
  let authState: AuthState;

  beforeEach(() => {
    authState = { status: 'authenticated', webId: 'https://user.example/#me' };
    appStateRepository = jasmine.createSpyObj<SolidAppStateRepository>(
      'SolidAppStateRepository',
      ['loadAppState', 'saveAppStateOrder'],
    );
    archiveStateRepository = jasmine.createSpyObj<SolidArchiveStateRepository>(
      'SolidArchiveStateRepository',
      ['loadArchiveStates', 'saveArchiveState', 'archiveModelToSolidArchiveState'],
    );
    archivedTaskRepository = jasmine.createSpyObj<SolidArchivedTaskRepository>(
      'SolidArchivedTaskRepository',
      ['loadArchivedTasks', 'replaceArchivedTasks'],
    );
    boardRepository = jasmine.createSpyObj<SolidBoardRepository>('SolidBoardRepository', [
      'loadBoards',
      'saveBoard',
    ]);
    globalConfigRepository = jasmine.createSpyObj<SolidGlobalConfigRepository>(
      'SolidGlobalConfigRepository',
      ['loadGlobalConfig', 'saveGlobalConfig'],
    );
    issueProviderRepository = jasmine.createSpyObj<SolidIssueProviderRepository>(
      'SolidIssueProviderRepository',
      ['loadIssueProviders', 'saveIssueProvider'],
    );
    menuTreeRepository = jasmine.createSpyObj<SolidMenuTreeRepository>(
      'SolidMenuTreeRepository',
      ['loadMenuTree', 'saveMenuTree'],
    );
    metricRepository = jasmine.createSpyObj<SolidMetricRepository>(
      'SolidMetricRepository',
      ['loadMetrics', 'saveMetric'],
    );
    noteRepository = jasmine.createSpyObj<SolidNoteRepository>('SolidNoteRepository', [
      'loadNotes',
      'saveNote',
    ]);
    plannerRepository = jasmine.createSpyObj<SolidPlannerRepository>(
      'SolidPlannerRepository',
      ['loadPlannerState', 'replacePlannerState'],
    );
    pluginDataRepository = jasmine.createSpyObj<SolidPluginDataRepository>(
      'SolidPluginDataRepository',
      [
        'loadPluginUserData',
        'loadPluginMetadata',
        'savePluginUserData',
        'savePluginMetadata',
      ],
    );
    projectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['loadProjects', 'saveProject'],
    );
    sectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['loadSections', 'saveSection'],
    );
    simpleCounterRepository = jasmine.createSpyObj<SolidSimpleCounterRepository>(
      'SolidSimpleCounterRepository',
      ['loadSimpleCounters', 'replaceSimpleCounters'],
    );
    snapshotService = jasmine.createSpyObj<StateSnapshotService>('StateSnapshotService', [
      'getStateSnapshotForOperationLogAsync',
    ]);
    validateSnapshot = jasmine
      .createSpy<SolidInitialUploadValidator>('validateSnapshot')
      .and.resolveTo(validValidationResult());
    tagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'loadTags',
      'saveTag',
    ]);
    taskRepeatCfgRepository = jasmine.createSpyObj<SolidTaskRepeatCfgRepository>(
      'SolidTaskRepeatCfgRepository',
      ['loadTaskRepeatCfgs', 'saveTaskRepeatCfg'],
    );
    taskRepository = jasmine.createSpyObj<SolidTaskRepository>('SolidTaskRepository', [
      'loadTasks',
      'saveTask',
    ]);
    timeTrackingRepository = jasmine.createSpyObj<SolidTimeTrackingRepository>(
      'SolidTimeTrackingRepository',
      ['loadTimeTrackingState', 'replaceTimeTrackingState'],
    );

    stubEmptyPod();

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidAppStateRepository, useValue: appStateRepository },
        { provide: SolidArchiveStateRepository, useValue: archiveStateRepository },
        { provide: SolidArchivedTaskRepository, useValue: archivedTaskRepository },
        { provide: SolidBoardRepository, useValue: boardRepository },
        { provide: SolidGlobalConfigRepository, useValue: globalConfigRepository },
        { provide: SolidIssueProviderRepository, useValue: issueProviderRepository },
        { provide: SolidMenuTreeRepository, useValue: menuTreeRepository },
        { provide: SolidMetricRepository, useValue: metricRepository },
        { provide: SolidNoteRepository, useValue: noteRepository },
        { provide: SolidPlannerRepository, useValue: plannerRepository },
        { provide: SolidPluginDataRepository, useValue: pluginDataRepository },
        { provide: SolidProjectRepository, useValue: projectRepository },
        { provide: SolidSectionRepository, useValue: sectionRepository },
        { provide: SolidSimpleCounterRepository, useValue: simpleCounterRepository },
        { provide: SolidTagRepository, useValue: tagRepository },
        { provide: SolidTaskRepeatCfgRepository, useValue: taskRepeatCfgRepository },
        { provide: SolidTaskRepository, useValue: taskRepository },
        { provide: SolidTimeTrackingRepository, useValue: timeTrackingRepository },
        { provide: StateSnapshotService, useValue: snapshotService },
        { provide: SOLID_INITIAL_UPLOAD_VALIDATE, useValue: validateSnapshot },
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
    TestBed.resetTestingModule();
  });

  it('refuses to upload before Solid auth is available', async () => {
    authState = { status: 'anonymous' };

    const result = await TestBed.inject(
      SolidInitialUploadService,
    ).uploadCurrentDataToEmptyPod();

    expect(result).toEqual({ type: 'not-authenticated' });
    expect(snapshotService.getStateSnapshotForOperationLogAsync).not.toHaveBeenCalled();
  });

  it('refuses to overwrite an existing Solid dataset', async () => {
    taskRepository.loadTasks.and.resolveTo([createTask('remote-task')]);

    const result = await TestBed.inject(
      SolidInitialUploadService,
    ).uploadCurrentDataToEmptyPod();

    expect(result).toEqual({ type: 'remote-not-empty' });
    expect(snapshotService.getStateSnapshotForOperationLogAsync).not.toHaveBeenCalled();
  });

  it('writes a validated local snapshot through the existing Solid repositories', async () => {
    const task = createTask('task-1');
    const snapshot = createAppData({
      task: {
        ids: [task.id],
        entities: { [task.id]: task },
      } as TaskState,
    });
    snapshotService.getStateSnapshotForOperationLogAsync.and.resolveTo(snapshot);

    const result = await TestBed.inject(
      SolidInitialUploadService,
    ).uploadCurrentDataToEmptyPod();

    expect(result).toEqual({ type: 'uploaded' });
    expect(validateSnapshot).toHaveBeenCalledOnceWith(snapshot);
    expect(taskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(globalConfigRepository.saveGlobalConfig).toHaveBeenCalledOnceWith(
      snapshot.globalConfig,
    );
    expect(menuTreeRepository.saveMenuTree).toHaveBeenCalledOnceWith(snapshot.menuTree);
    expect(appStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      projectOrder: [],
      tagOrder: ['TODAY'],
      noteTodayOrder: [],
      sectionOrder: [],
    });
  });

  it('rejects an invalid local snapshot before writing to Solid', async () => {
    snapshotService.getStateSnapshotForOperationLogAsync.and.resolveTo(
      {} as AppDataComplete,
    );
    validateSnapshot.and.resolveTo({ isValid: false, errorCount: 3 });

    const result = await TestBed.inject(
      SolidInitialUploadService,
    ).uploadCurrentDataToEmptyPod();

    expect(result.type).toBe('invalid-state');
    expect(taskRepository.saveTask).not.toHaveBeenCalled();
    expect(globalConfigRepository.saveGlobalConfig).not.toHaveBeenCalled();
  });

  const stubEmptyPod = (): void => {
    const emptySnapshot = createAppData();

    taskRepository.loadTasks.and.resolveTo([]);
    archiveStateRepository.loadArchiveStates.and.resolveTo({
      young: createDefaultSolidArchiveState('young'),
      old: createDefaultSolidArchiveState('old'),
    });
    archiveStateRepository.archiveModelToSolidArchiveState.and.callFake((bucket) =>
      createDefaultSolidArchiveState(bucket),
    );
    archivedTaskRepository.loadArchivedTasks.and.resolveTo([]);
    boardRepository.loadBoards.and.resolveTo([]);
    globalConfigRepository.loadGlobalConfig.and.resolveTo(null);
    issueProviderRepository.loadIssueProviders.and.resolveTo([]);
    menuTreeRepository.loadMenuTree.and.resolveTo(null);
    metricRepository.loadMetrics.and.resolveTo([]);
    noteRepository.loadNotes.and.resolveTo([]);
    plannerRepository.loadPlannerState.and.resolveTo(emptySnapshot.planner);
    pluginDataRepository.loadPluginUserData.and.resolveTo([]);
    pluginDataRepository.loadPluginMetadata.and.resolveTo([]);
    appStateRepository.loadAppState.and.resolveTo(null);
    projectRepository.loadProjects.and.resolveTo([]);
    sectionRepository.loadSections.and.resolveTo([]);
    simpleCounterRepository.loadSimpleCounters.and.resolveTo([]);
    tagRepository.loadTags.and.resolveTo([]);
    taskRepeatCfgRepository.loadTaskRepeatCfgs.and.resolveTo([]);
    timeTrackingRepository.loadTimeTrackingState.and.resolveTo(
      emptySnapshot.timeTracking,
    );
  };
});

const createAppData = (overrides: Partial<AppDataComplete> = {}): AppDataComplete =>
  ({
    ...Object.fromEntries(
      Object.entries(MODEL_CONFIGS).map(([key, config]) => [
        key,
        structuredClone(config.defaultData),
      ]),
    ),
    ...overrides,
  }) as AppDataComplete;

const createTask = (id: string): Task => ({
  ...DEFAULT_TASK,
  id,
  created: 1710000000000,
  projectId: INBOX_PROJECT.id,
});

const validValidationResult = (): SolidInitialUploadValidationResult => ({
  isValid: true,
  errorCount: 0,
});
