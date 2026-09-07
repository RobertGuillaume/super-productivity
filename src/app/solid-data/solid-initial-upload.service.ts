import { inject, Injectable, InjectionToken } from '@angular/core';
import { ArchiveModel } from '../features/archive/archive.model';
import { IssueProvider } from '../features/issue/issue.model';
import { Metric } from '../features/metric/metric.model';
import { Note, NoteState } from '../features/note/note.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { Section } from '../features/section/section.model';
import { SimpleCounter } from '../features/simple-counter/simple-counter.model';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { TaskRepeatCfg } from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { Task, TaskArchive } from '../features/tasks/task.model';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { AppStateSnapshot } from '../op-log/core/types/backup.types';
import { AppDataComplete } from '../op-log/model/model-config';
import { StateSnapshotService } from '../op-log/backup/state-snapshot.service';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import { SolidArchiveBucket, SolidArchivedTask } from './solid-archived-task.mapper';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidBoardRepository } from './solid-board.repository';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';
import { SolidMetricRepository } from './solid-metric.repository';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
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

export type SolidInitialUploadResult =
  | { type: 'uploaded' }
  | { type: 'not-authenticated' }
  | { type: 'remote-not-empty' }
  | { type: 'invalid-state'; errorCount: number };

type EntityStateLike<T> = {
  ids: readonly (string | number)[];
  entities: Readonly<Record<string, T | undefined>>;
};

export type SolidInitialUploadValidationResult = {
  isValid: boolean;
  errorCount: number;
};

export type SolidInitialUploadValidator = (
  snapshot: AppDataComplete,
) => Promise<SolidInitialUploadValidationResult>;

export const SOLID_INITIAL_UPLOAD_VALIDATE =
  new InjectionToken<SolidInitialUploadValidator>('SOLID_INITIAL_UPLOAD_VALIDATE', {
    providedIn: 'root',
    factory: () => async (snapshot: AppDataComplete) => {
      const { validateFull } = await import('../op-log/validation/validation-fn');
      const validationResult = validateFull(snapshot);
      const errorCount =
        validationResult.typiaResult.success === false
          ? validationResult.typiaResult.errors.length
          : validationResult.crossModelError
            ? 1
            : 0;

      return {
        isValid: validationResult.isValid,
        errorCount,
      };
    },
  });

@Injectable({ providedIn: 'root' })
export class SolidInitialUploadService {
  private readonly appStateRepository = inject(SolidAppStateRepository);
  private readonly archiveStateRepository = inject(SolidArchiveStateRepository);
  private readonly archivedTaskRepository = inject(SolidArchivedTaskRepository);
  private readonly boardRepository = inject(SolidBoardRepository);
  private readonly globalConfigRepository = inject(SolidGlobalConfigRepository);
  private readonly issueProviderRepository = inject(SolidIssueProviderRepository);
  private readonly menuTreeRepository = inject(SolidMenuTreeRepository);
  private readonly metricRepository = inject(SolidMetricRepository);
  private readonly noteRepository = inject(SolidNoteRepository);
  private readonly plannerRepository = inject(SolidPlannerRepository);
  private readonly pluginDataRepository = inject(SolidPluginDataRepository);
  private readonly projectRepository = inject(SolidProjectRepository);
  private readonly sectionRepository = inject(SolidSectionRepository);
  private readonly simpleCounterRepository = inject(SolidSimpleCounterRepository);
  private readonly snapshotService = inject(StateSnapshotService);
  private readonly tagRepository = inject(SolidTagRepository);
  private readonly taskRepeatCfgRepository = inject(SolidTaskRepeatCfgRepository);
  private readonly taskRepository = inject(SolidTaskRepository);
  private readonly timeTrackingRepository = inject(SolidTimeTrackingRepository);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly validateSnapshot = inject(SOLID_INITIAL_UPLOAD_VALIDATE);

  async uploadCurrentDataToEmptyPod(): Promise<SolidInitialUploadResult> {
    if (this.solidRuntime.client.auth.state().status !== 'authenticated') {
      return { type: 'not-authenticated' };
    }

    await this.solidRuntime.ensureAppContainers();

    if (await this.hasExistingSolidData()) {
      return { type: 'remote-not-empty' };
    }

    const snapshot =
      (await this.snapshotService.getStateSnapshotForOperationLogAsync()) as AppDataComplete;
    const validationResult = await this.validateSnapshot(snapshot);
    if (!validationResult.isValid) {
      return { type: 'invalid-state', errorCount: validationResult.errorCount };
    }

    await this.writeSnapshot(snapshot);
    return { type: 'uploaded' };
  }

  private async hasExistingSolidData(): Promise<boolean> {
    const [
      tasksRead,
      archiveStatesRead,
      archivedTasksRead,
      boardsRead,
      globalConfigRead,
      menuTreeRead,
      projectsRead,
      tagsRead,
      notesRead,
      sectionsRead,
      issueProvidersRead,
      taskRepeatCfgsRead,
      simpleCountersRead,
      metricsRead,
      plannerStateRead,
      pluginUserDataRead,
      pluginMetadataRead,
      appStateRead,
      timeTrackingStateRead,
    ] = await Promise.all([
      this.taskRepository.loadTasks(),
      this.archiveStateRepository.loadArchiveStates(),
      this.archivedTaskRepository.loadArchivedTasks(),
      this.boardRepository.loadBoards(),
      this.globalConfigRepository.loadGlobalConfig(),
      this.menuTreeRepository.loadMenuTree(),
      this.projectRepository.loadProjects(),
      this.tagRepository.loadTags(),
      this.noteRepository.loadNotes(),
      this.sectionRepository.loadSections(),
      this.issueProviderRepository.loadIssueProviders(),
      this.taskRepeatCfgRepository.loadTaskRepeatCfgs(),
      this.simpleCounterRepository.loadSimpleCounters(),
      this.metricRepository.loadMetrics(),
      this.plannerRepository.loadPlannerState(),
      this.pluginDataRepository.loadPluginUserData(),
      this.pluginDataRepository.loadPluginMetadata(),
      this.appStateRepository.loadAppState(),
      this.timeTrackingRepository.loadTimeTrackingState(),
    ]);
    const tasks = tasksRead.value;
    const archiveStates = archiveStatesRead.value;
    const archivedTasks = archivedTasksRead.value;
    const boards = boardsRead.value;
    const globalConfig = globalConfigRead.value;
    const menuTree = menuTreeRead.value;
    const projects = projectsRead.value;
    const tags = tagsRead.value;
    const notes = notesRead.value;
    const sections = sectionsRead.value;
    const issueProviders = issueProvidersRead.value;
    const taskRepeatCfgs = taskRepeatCfgsRead.value;
    const simpleCounters = simpleCountersRead.value;
    const metrics = metricsRead.value;
    const plannerState = plannerStateRead.value;
    const pluginUserData = pluginUserDataRead.value;
    const pluginMetadata = pluginMetadataRead.value;
    const appState = appStateRead.value;
    const timeTrackingState = timeTrackingStateRead.value;

    return (
      tasks.length > 0 ||
      archiveStates.young.updated > 0 ||
      archiveStates.old.updated > 0 ||
      archivedTasks.length > 0 ||
      boards.length > 0 ||
      globalConfig !== null ||
      menuTree !== null ||
      projects.some((project) => project.id !== INBOX_PROJECT.id) ||
      tags.some((tag) => tag.id !== TODAY_TAG.id) ||
      notes.length > 0 ||
      sections.length > 0 ||
      issueProviders.length > 0 ||
      taskRepeatCfgs.length > 0 ||
      simpleCounters.length > 0 ||
      metrics.length > 0 ||
      Object.keys(plannerState.days).length > 0 ||
      pluginUserData.length > 0 ||
      pluginMetadata.length > 0 ||
      appState !== null ||
      hasTimeTrackingData(timeTrackingState)
    );
  }

  private async writeSnapshot(snapshot: AppDataComplete): Promise<void> {
    const tasks = entityValues<Task>(snapshot.task as EntityStateLike<Task>);
    const projects = entityValues<Project>(snapshot.project as EntityStateLike<Project>);
    const tags = entityValues<Tag>(snapshot.tag as EntityStateLike<Tag>);
    const notes = entityValues<Note>(snapshot.note as EntityStateLike<Note>);
    const sections = entityValues<Section>(snapshot.section as EntityStateLike<Section>);
    const issueProviders = entityValues<IssueProvider>(
      snapshot.issueProvider as EntityStateLike<IssueProvider>,
    );
    const taskRepeatCfgs = entityValues<TaskRepeatCfg>(
      snapshot.taskRepeatCfg as EntityStateLike<TaskRepeatCfg>,
    );
    const simpleCounters = entityValues<SimpleCounter>(
      snapshot.simpleCounter as EntityStateLike<SimpleCounter>,
    );
    const metrics = entityValues<Metric>(snapshot.metric as EntityStateLike<Metric>);
    const boards = snapshot.boards.boardCfgs;
    const pluginUserData = [...(snapshot.pluginUserData as PluginUserData[])];
    const pluginMetadata = [...(snapshot.pluginMetadata as PluginMetadata[])];

    await settleSolidMutations([
      ...tasks.map((task) => this.taskRepository.saveTask(task)),
      ...projects.map((project) => this.projectRepository.saveProject(project)),
      ...tags.map((tag) => this.tagRepository.saveTag(tag)),
      ...notes.map((note) => this.noteRepository.saveNote(note)),
      ...sections.map((section) => this.sectionRepository.saveSection(section)),
      ...issueProviders.map((issueProvider) =>
        this.issueProviderRepository.saveIssueProvider(issueProvider),
      ),
      ...taskRepeatCfgs.map((taskRepeatCfg) =>
        this.taskRepeatCfgRepository.saveTaskRepeatCfg(taskRepeatCfg),
      ),
      ...metrics.map((metric) => this.metricRepository.saveMetric(metric)),
      ...boards.map((board, order) => this.boardRepository.saveBoard(board, order)),
      ...pluginUserData.map((entry) =>
        this.pluginDataRepository.savePluginUserData(entry),
      ),
      ...pluginMetadata.map((entry) =>
        this.pluginDataRepository.savePluginMetadata(entry),
      ),
      this.simpleCounterRepository.replaceSimpleCounters(simpleCounters),
      this.globalConfigRepository.saveGlobalConfig(snapshot.globalConfig),
      this.menuTreeRepository.saveMenuTree(snapshot.menuTree),
      this.plannerRepository.replacePlannerState(snapshot.planner),
      this.timeTrackingRepository.replaceTimeTrackingState(snapshot.timeTracking),
      this.archiveStateRepository.saveArchiveState(
        this.archiveStateRepository.archiveModelToSolidArchiveState(
          'young',
          snapshot.archiveYoung as ArchiveModel,
        ),
      ),
      this.archiveStateRepository.saveArchiveState(
        this.archiveStateRepository.archiveModelToSolidArchiveState(
          'old',
          snapshot.archiveOld as ArchiveModel,
        ),
      ),
      this.archivedTaskRepository.replaceArchivedTasks([
        ...archivedTasksFromArchive(snapshot.archiveYoung as ArchiveModel, 'young'),
        ...archivedTasksFromArchive(snapshot.archiveOld as ArchiveModel, 'old'),
      ]),
      this.appStateRepository.saveAppStateOrder({
        projectOrder: entityIds(snapshot.project).filter((id) => id !== INBOX_PROJECT.id),
        tagOrder: entityIds(snapshot.tag),
        noteTodayOrder: [...((snapshot.note as NoteState).todayOrder ?? [])],
        sectionOrder: entityIds(snapshot.section),
      }),
    ]);
  }
}

const entityValues = <T>(state: EntityStateLike<T>): T[] =>
  state.ids
    .map((id) => state.entities[String(id)])
    .filter((entity): entity is T => entity !== undefined && entity !== null);

const entityIds = (state: AppStateSnapshot[keyof AppStateSnapshot]): string[] => {
  const maybeEntityState = state as { ids?: readonly (string | number)[] };
  return maybeEntityState.ids?.map((id) => String(id)) ?? [];
};

const archivedTasksFromArchive = (
  archive: ArchiveModel,
  bucket: SolidArchiveBucket,
): SolidArchivedTask[] =>
  entityValues<Task>(archive.task as TaskArchive as EntityStateLike<Task>).map(
    (task) => ({
      task,
      bucket,
    }),
  );

const hasTimeTrackingData = (state: TimeTrackingState): boolean =>
  Object.values(state.project).some((entries) => Object.keys(entries).length > 0) ||
  Object.values(state.tag).some((entries) => Object.keys(entries).length > 0);
