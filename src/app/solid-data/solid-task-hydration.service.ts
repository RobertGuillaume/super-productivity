import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import type { QueryMetadata } from '@solid-intents/runtime';
import { ArchiveDbAdapter } from '../core/persistence/archive-db-adapter.service';
import { Log } from '../core/log';
import { BoardCfg } from '../features/boards/boards.model';
import { GlobalConfigState } from '../features/config/global-config.model';
import { Metric } from '../features/metric/metric.model';
import { MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import {
  initialMetricState,
  metricAdapter,
} from '../features/metric/store/metric.reducer';
import { Note } from '../features/note/note.model';
import { IssueProvider } from '../features/issue/issue.model';
import {
  adapter as issueProviderAdapter,
  issueProviderInitialState,
} from '../features/issue/store/issue-provider.reducer';
import {
  adapter as noteAdapter,
  initialNoteState,
} from '../features/note/store/note.reducer';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import {
  initialProjectState,
  projectAdapter,
} from '../features/project/store/project.reducer';
import {
  PlannerState,
  plannerInitialState,
} from '../features/planner/store/planner.reducer';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import { Section } from '../features/section/section.model';
import {
  adapter as sectionAdapter,
  initialSectionState,
} from '../features/section/store/section.reducer';
import { SimpleCounter } from '../features/simple-counter/simple-counter.model';
import {
  adapter as simpleCounterAdapter,
  initialSimpleCounterState,
} from '../features/simple-counter/store/simple-counter.reducer';
import { Task } from '../features/tasks/task.model';
import { TaskRepeatCfg } from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { initialTaskRepeatCfgState } from '../features/task-repeat-cfg/store/task-repeat-cfg.reducer';
import { adapter as taskRepeatCfgAdapter } from '../features/task-repeat-cfg/store/task-repeat-cfg.selectors';
import { initialTaskState } from '../features/tasks/store/task.reducer';
import { taskAdapter } from '../features/tasks/store/task.adapter';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { initialTimeTrackingState } from '../features/time-tracking/store/time-tracking.reducer';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { initialTagState, tagAdapter } from '../features/tag/store/tag.reducer';
import { AppDataComplete, MODEL_CONFIGS } from '../op-log/model/model-config';
import { runWithLoadAllDataFailureCollector } from '../op-log/apply/load-all-data-failure-guard.meta-reducer';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import {
  createDefaultSolidArchiveState,
  SolidArchiveState,
} from './solid-archive-state.mapper';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidArchivedTask, SolidArchiveBucket } from './solid-archived-task.mapper';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidAppState } from './solid-app-state.mapper';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidBoardRepository } from './solid-board.repository';
import { SolidGlobalConfigRepository } from './solid-global-config.repository';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidMetricRepository } from './solid-metric.repository';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidPluginDataRepository } from './solid-plugin-data.repository';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';
import { SolidRepositoryRead } from './solid-repository-read';
import { solidCatalogReconciled } from './solid-catalog-reconciled.action';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidTaskAccessService } from './solid-task-access.service';

export interface SolidCatalogDiagnostic {
  model: string;
  errorName: string;
}

export interface SolidCatalogSnapshot {
  appDataComplete: AppDataComplete;
  metadata: readonly QueryMetadata[];
  diagnostics: readonly SolidCatalogDiagnostic[];
  modelOutcomes: readonly SolidCatalogModelOutcome[];
  degraded: boolean;
}

export interface SolidCatalogModelOutcome {
  model: string;
  status: 'complete' | 'partial' | 'failed';
}

export interface SolidCatalogInput {
  tasks: readonly Task[];
  archiveStates: { young: SolidArchiveState; old: SolidArchiveState };
  boards: readonly BoardCfg[];
  globalConfig: GlobalConfigState | null;
  menuTree: MenuTreeState | null;
  projects: readonly Project[];
  tags: readonly Tag[];
  notes: readonly Note[];
  sections: readonly Section[];
  issueProviders: readonly IssueProvider[];
  taskRepeatCfgs: readonly TaskRepeatCfg[];
  simpleCounters: readonly SimpleCounter[];
  metrics: readonly Metric[];
  archivedTasks: readonly SolidArchivedTask[];
  plannerState: PlannerState;
  pluginUserData: readonly PluginUserData[];
  pluginMetadata: readonly PluginMetadata[];
  appState: SolidAppState | null;
  timeTrackingState: TimeTrackingState;
}

@Injectable({ providedIn: 'root' })
export class SolidTaskHydrationService {
  private readonly store = inject(Store);
  private readonly archiveDbAdapter = inject(ArchiveDbAdapter);
  private readonly dataLayerState = inject(SolidDataLayerStateService);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly taskAccess = inject(SolidTaskAccessService);
  private readonly archiveStateRepository = inject(SolidArchiveStateRepository);
  private readonly taskRepository = inject(SolidTaskRepository);
  private readonly archivedTaskRepository = inject(SolidArchivedTaskRepository);
  private readonly boardRepository = inject(SolidBoardRepository);
  private readonly globalConfigRepository = inject(SolidGlobalConfigRepository);
  private readonly menuTreeRepository = inject(SolidMenuTreeRepository);
  private readonly projectRepository = inject(SolidProjectRepository);
  private readonly plannerRepository = inject(SolidPlannerRepository);
  private readonly pluginDataRepository = inject(SolidPluginDataRepository);
  private readonly tagRepository = inject(SolidTagRepository);
  private readonly noteRepository = inject(SolidNoteRepository);
  private readonly issueProviderRepository = inject(SolidIssueProviderRepository);
  private readonly metricRepository = inject(SolidMetricRepository);
  private readonly sectionRepository = inject(SolidSectionRepository);
  private readonly taskRepeatCfgRepository = inject(SolidTaskRepeatCfgRepository);
  private readonly simpleCounterRepository = inject(SolidSimpleCounterRepository);
  private readonly appStateRepository = inject(SolidAppStateRepository);
  private readonly timeTrackingRepository = inject(SolidTimeTrackingRepository);
  private lastPublishedSnapshot: SolidCatalogSnapshot | null = null;
  private lastPublishedInput: SolidCatalogInput | null = null;
  private readonly inputsBySnapshot = new WeakMap<
    SolidCatalogSnapshot,
    SolidCatalogInput
  >();
  private lastAttemptWasDegraded = false;

  async hydrateStore(): Promise<SolidCatalogSnapshot> {
    return this.publishSnapshot('initial');
  }

  async reconcileStore(): Promise<SolidCatalogSnapshot> {
    return this.publishSnapshot('reconcile');
  }

  resetCatalogBaseline(): void {
    this.lastPublishedSnapshot = null;
    this.lastPublishedInput = null;
    this.lastAttemptWasDegraded = false;
  }

  hasDegradedState(): boolean {
    return this.lastAttemptWasDegraded;
  }

  async restoreLastPublishedSnapshot(): Promise<boolean> {
    const snapshot = this.lastPublishedSnapshot;
    if (snapshot === null) {
      return false;
    }

    this.store.dispatch(
      solidCatalogReconciled({ appDataComplete: snapshot.appDataComplete }),
    );
    return true;
  }

  async readCatalogSnapshot(
    previousInput: SolidCatalogInput | null = null,
  ): Promise<SolidCatalogSnapshot> {
    const settled = await Promise.allSettled([
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
    ] as const);
    const diagnostics: SolidCatalogDiagnostic[] = [];
    const metadata: QueryMetadata[] = [];
    const modelOutcomes: SolidCatalogModelOutcome[] = [];
    const containers = this.solidRuntime.ensureLayout().containers;
    const read = <T>(
      result: PromiseSettledResult<SolidRepositoryRead<T>>,
      fallback: T,
      model: string,
      containerUri: string,
      previous: T | undefined,
      mergePartial: (oldValue: T, newValue: T) => T,
      options: { forcePartial?: boolean } = {},
    ): T =>
      readSettledValue({
        result,
        fallback,
        model,
        containerUri,
        previous,
        mergePartial,
        forcePartial: options.forcePartial === true,
        catalogAuthority: this.catalogAuthority,
        diagnostics,
        metadata,
        modelOutcomes,
      });
    const readArray = <T extends { id: string }>(
      result: PromiseSettledResult<SolidRepositoryRead<T[]>>,
      fallback: T[],
      model: string,
      containerUri: string,
      previous: readonly T[] | undefined,
    ): T[] =>
      read(
        result,
        fallback,
        model,
        containerUri,
        previous === undefined ? undefined : [...previous],
        (oldValue, newValue) => mergeById(oldValue, newValue, (item) => item.id),
      );

    const tasks = read(
      settled[0],
      [] as Task[],
      'tasks',
      containers.tasks,
      previousInput?.tasks === undefined ? undefined : [...previousInput.tasks],
      (previous, current) =>
        mergeById(
          previous.filter(
            (previousTask) =>
              !this.taskAccess.isAppOwned(previousTask.id) ||
              current.some((currentTask) => currentTask.id === previousTask.id),
          ),
          current,
          (task) => task.id,
        ),
      { forcePartial: true },
    );
    const archiveStates = read(
      settled[1],
      {
        young: createDefaultSolidArchiveState('young'),
        old: createDefaultSolidArchiveState('old'),
      },
      'archiveState',
      containers.archiveState,
      previousInput?.archiveStates,
      mergeArchiveStates,
    );
    const archivedTasks = read(
      settled[2],
      [] as SolidArchivedTask[],
      'archivedTasks',
      containers.archivedTasks,
      previousInput?.archivedTasks === undefined
        ? undefined
        : [...previousInput.archivedTasks],
      (previous, current) =>
        mergeById(previous, current, ({ task: archivedTask }) => archivedTask.id),
    );
    const boards = readArray(
      settled[3],
      [],
      'boards',
      containers.boards,
      previousInput?.boards,
    );
    const globalConfig = read(
      settled[4],
      null,
      'globalConfig',
      containers.config,
      previousInput?.globalConfig,
      preserveNull,
    );
    const menuTree = read(
      settled[5],
      null,
      'menuTree',
      containers.menuTree,
      previousInput?.menuTree,
      preserveNull,
    );
    const projects = readArray(
      settled[6],
      [],
      'projects',
      containers.projects,
      previousInput?.projects,
    );
    const tags = readArray(settled[7], [], 'tags', containers.tags, previousInput?.tags);
    const notes = readArray(
      settled[8],
      [],
      'notes',
      containers.notes,
      previousInput?.notes,
    );
    const sections = readArray(
      settled[9],
      [],
      'sections',
      containers.sections,
      previousInput?.sections,
    );
    const issueProviders = readArray(
      settled[10],
      [],
      'issueProviders',
      containers.issueProviders,
      previousInput?.issueProviders,
    );
    const taskRepeatCfgs = readArray(
      settled[11],
      [],
      'taskRepeatCfgs',
      containers.taskRepeatCfgs,
      previousInput?.taskRepeatCfgs,
    );
    const simpleCounters = readArray(
      settled[12],
      [],
      'simpleCounters',
      containers.simpleCounters,
      previousInput?.simpleCounters,
    );
    const metrics = readArray(
      settled[13],
      [],
      'metrics',
      containers.metrics,
      previousInput?.metrics,
    );
    const plannerState = read(
      settled[14],
      { ...plannerInitialState, days: {} },
      'planner',
      containers.planner,
      previousInput?.plannerState,
      mergePlannerState,
    );
    const pluginUserData = readArray(
      settled[15],
      [],
      'pluginUserData',
      containers.pluginUserData,
      previousInput?.pluginUserData,
    );
    const pluginMetadata = readArray(
      settled[16],
      [],
      'pluginMetadata',
      containers.pluginMetadata,
      previousInput?.pluginMetadata,
    );
    const appState = read(
      settled[17],
      null,
      'appState',
      containers.app,
      previousInput?.appState,
      preserveNull,
    );
    const timeTrackingState = read(
      settled[18],
      initialTimeTrackingState,
      'timeTracking',
      containers.timeTracking,
      previousInput?.timeTrackingState,
      mergeTimeTracking,
    );

    const catalogInput: SolidCatalogInput = {
      tasks,
      archiveStates,
      boards,
      globalConfig,
      menuTree,
      projects,
      tags,
      notes,
      sections,
      issueProviders,
      taskRepeatCfgs,
      simpleCounters,
      metrics,
      archivedTasks,
      plannerState,
      pluginUserData,
      pluginMetadata,
      appState,
      timeTrackingState,
    };

    const snapshot: SolidCatalogSnapshot = {
      appDataComplete: createSolidAppData(catalogInput),
      metadata,
      diagnostics,
      modelOutcomes,
      degraded: false,
    };
    this.inputsBySnapshot.set(snapshot, catalogInput);
    return snapshot;
  }

  private async publishSnapshot(
    mode: 'initial' | 'reconcile',
  ): Promise<SolidCatalogSnapshot> {
    const startedAt = performance.now();
    const snapshot = await this.readCatalogSnapshot(
      mode === 'reconcile' ? this.lastPublishedInput : null,
    );
    let archiveFailed = false;

    try {
      await this.archiveDbAdapter.saveArchivesAtomic(
        snapshot.appDataComplete.archiveYoung,
        snapshot.appDataComplete.archiveOld,
      );
    } catch (error) {
      archiveFailed = true;
      this.dataLayerState.addDiagnostics();
      Log.err('Solid catalog archive cache update failed', {
        operation: mode,
        model: 'archive',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }

    const reducerFailures: Error[] = [];
    runWithLoadAllDataFailureCollector(
      (error) => reducerFailures.push(error),
      () =>
        this.store.dispatch(
          mode === 'initial'
            ? loadAllData({ appDataComplete: snapshot.appDataComplete })
            : solidCatalogReconciled({
                appDataComplete: snapshot.appDataComplete,
              }),
        ),
    );
    if (reducerFailures.length > 0) {
      this.dataLayerState.addDiagnostics(reducerFailures.length);
      Log.err('Solid catalog reducer reconciliation failed', {
        operation: mode,
        failureCount: reducerFailures.length,
      });
    } else {
      this.lastPublishedSnapshot = snapshot;
      this.lastPublishedInput = this.inputsBySnapshot.get(snapshot) ?? null;
    }
    if (snapshot.diagnostics.length > 0) {
      this.dataLayerState.addDiagnostics(snapshot.diagnostics.length);
    }
    snapshot.degraded =
      archiveFailed || snapshot.diagnostics.length > 0 || reducerFailures.length > 0;
    this.lastAttemptWasDegraded = snapshot.degraded;
    if (snapshot.degraded) {
      this.dataLayerState.setPhase('degraded');
    }

    const taskCount = snapshot.appDataComplete.task.ids.length;
    Log.normal(
      `Solid catalog ${mode} hydration completed in ${Math.round(performance.now() - startedAt)}ms ` +
        `(${taskCount} tasks, ${snapshot.diagnostics.length} model diagnostics)`,
    );
    return snapshot;
  }
}

const readSettledValue = <T>({
  result,
  fallback,
  model,
  containerUri,
  previous,
  mergePartial,
  forcePartial,
  catalogAuthority,
  diagnostics,
  metadata,
  modelOutcomes,
}: {
  result: PromiseSettledResult<SolidRepositoryRead<T>>;
  fallback: T;
  model: string;
  containerUri: string;
  previous: T | undefined;
  mergePartial: (oldValue: T, newValue: T) => T;
  forcePartial: boolean;
  catalogAuthority: SolidCatalogAuthorityService;
  diagnostics: SolidCatalogDiagnostic[];
  metadata: QueryMetadata[];
  modelOutcomes: SolidCatalogModelOutcome[];
}): T => {
  if (result.status === 'fulfilled') {
    metadata.push(...result.value.metadata);
    const runtimeComplete =
      result.value.metadata.length > 0 &&
      result.value.metadata.every((item) => item.completeness.status === 'complete');
    const complete =
      runtimeComplete ||
      (!forcePartial && catalogAuthority.isAuthoritative(containerUri));
    modelOutcomes.push({ model, status: complete ? 'complete' : 'partial' });
    if (previous === undefined || complete) {
      return result.value.value;
    }
    return mergePartial(previous, result.value.value);
  }

  const errorName = result.reason instanceof Error ? result.reason.name : 'UnknownError';
  diagnostics.push({ model, errorName });
  modelOutcomes.push({ model, status: 'failed' });
  Log.err('Solid catalog model read failed', { model, errorName });
  return previous ?? fallback;
};

const mergeById = <T>(
  previous: readonly T[],
  current: readonly T[],
  id: (value: T) => string,
): T[] => {
  const merged = new Map(previous.map((value) => [id(value), value]));
  for (const value of current) {
    merged.set(id(value), value);
  }
  return [...merged.values()];
};

const preserveNull = <T>(previous: T | null, current: T | null): T | null =>
  current ?? previous;

const mergeArchiveStates = (
  previous: { young: SolidArchiveState; old: SolidArchiveState },
  current: { young: SolidArchiveState; old: SolidArchiveState },
): { young: SolidArchiveState; old: SolidArchiveState } => ({
  young: current.young.updated === 0 ? previous.young : current.young,
  old: current.old.updated === 0 ? previous.old : current.old,
});

const mergePlannerState = (
  previous: PlannerState,
  current: PlannerState,
): PlannerState => ({
  days: { ...previous.days, ...current.days },
  addPlannedTasksDialogLastShown:
    current.addPlannedTasksDialogLastShown ?? previous.addPlannedTasksDialogLastShown,
});

const mergeTimeTracking = (
  previous: TimeTrackingState,
  current: TimeTrackingState,
): TimeTrackingState => ({
  project: mergeTimeTrackingContexts(previous.project, current.project),
  tag: mergeTimeTrackingContexts(previous.tag, current.tag),
});

const mergeTimeTrackingContexts = <T extends Record<string, unknown>>(
  previous: Record<string, T>,
  current: Record<string, T>,
): Record<string, T> => {
  const merged = { ...previous };
  for (const [contextId, dates] of Object.entries(current)) {
    merged[contextId] = { ...previous[contextId], ...dates } as T;
  }
  return merged;
};

export const createSolidAppData = (input: {
  tasks: readonly Task[];
  archiveStates?: {
    young: SolidArchiveState;
    old: SolidArchiveState;
  };
  boards?: readonly BoardCfg[];
  globalConfig?: GlobalConfigState | null;
  menuTree?: MenuTreeState | null;
  projects: readonly Project[];
  tags: readonly Tag[];
  notes: readonly Note[];
  sections?: readonly Section[];
  issueProviders?: readonly IssueProvider[];
  taskRepeatCfgs?: readonly TaskRepeatCfg[];
  simpleCounters?: readonly SimpleCounter[];
  metrics?: readonly Metric[];
  archivedTasks?: readonly SolidArchivedTask[];
  plannerState?: PlannerState;
  pluginUserData?: readonly PluginUserData[];
  pluginMetadata?: readonly PluginMetadata[];
  appState?: SolidAppState | null;
  timeTrackingState?: TimeTrackingState;
}): AppDataComplete => {
  const appDataComplete = Object.fromEntries(
    Object.entries(MODEL_CONFIGS).map(([key, config]) => [key, config.defaultData]),
  ) as AppDataComplete;
  const projects = applyProjectOrder(
    ensureInboxProject(input.projects),
    input.appState?.projectOrder ?? [],
  );
  const tags = applyOrder(ensureTodayTag(input.tags), input.appState?.tagOrder ?? []);
  const noteTodayOrder = applyNoteTodayOrder(
    input.notes,
    input.appState?.noteTodayOrder ?? [],
  );
  const sections = applyOrder(input.sections ?? [], input.appState?.sectionOrder ?? []);
  const archiveYoungTasks = archivedTasksForBucket(input.archivedTasks ?? [], 'young');
  const archiveOldTasks = archivedTasksForBucket(input.archivedTasks ?? [], 'old');

  return {
    ...appDataComplete,
    boards: {
      boardCfgs: [...(input.boards ?? [])],
    },
    globalConfig: input.globalConfig ?? appDataComplete.globalConfig,
    menuTree: input.menuTree ?? appDataComplete.menuTree,
    task: taskAdapter.setAll([...input.tasks], initialTaskState),
    project: projectAdapter.setAll(projects, initialProjectState),
    tag: tagAdapter.setAll(tags, initialTagState),
    note: noteAdapter.setAll([...input.notes], {
      ...initialNoteState,
      todayOrder: noteTodayOrder,
    }),
    section: sectionAdapter.setAll(sections, initialSectionState),
    issueProvider: issueProviderAdapter.setAll(
      [...(input.issueProviders ?? [])],
      issueProviderInitialState,
    ),
    taskRepeatCfg: taskRepeatCfgAdapter.setAll(
      [...(input.taskRepeatCfgs ?? [])],
      initialTaskRepeatCfgState,
    ),
    simpleCounter: simpleCounterAdapter.setAll(
      [...(input.simpleCounters ?? [])],
      initialSimpleCounterState,
    ),
    metric: metricAdapter.setAll([...(input.metrics ?? [])], initialMetricState),
    pluginUserData: [...(input.pluginUserData ?? [])],
    pluginMetadata: [...(input.pluginMetadata ?? [])],
    timeTracking: input.timeTrackingState ?? appDataComplete.timeTracking,
    archiveYoung: {
      ...appDataComplete.archiveYoung,
      task: taskAdapter.setAll(archiveYoungTasks, initialTaskState),
      timeTracking:
        input.archiveStates?.young.timeTracking ??
        appDataComplete.archiveYoung.timeTracking,
      lastTimeTrackingFlush:
        input.archiveStates?.young.lastTimeTrackingFlush ??
        appDataComplete.archiveYoung.lastTimeTrackingFlush,
    },
    archiveOld: {
      ...appDataComplete.archiveOld,
      task: taskAdapter.setAll(archiveOldTasks, initialTaskState),
      timeTracking:
        input.archiveStates?.old.timeTracking ?? appDataComplete.archiveOld.timeTracking,
      lastTimeTrackingFlush:
        input.archiveStates?.old.lastTimeTrackingFlush ??
        appDataComplete.archiveOld.lastTimeTrackingFlush,
    },
    planner: input.plannerState ?? appDataComplete.planner,
  };
};

const ensureInboxProject = (projects: readonly Project[]): Project[] =>
  projects.some((project) => project.id === INBOX_PROJECT.id)
    ? [...projects]
    : [INBOX_PROJECT, ...projects];

const ensureTodayTag = (tags: readonly Tag[]): Tag[] =>
  tags.some((tag) => tag.id === TODAY_TAG.id) ? [...tags] : [TODAY_TAG, ...tags];

const applyProjectOrder = (
  projects: readonly Project[],
  projectOrder: readonly string[],
): Project[] => {
  const inbox = projects.find((project) => project.id === INBOX_PROJECT.id);
  const otherProjects = projects.filter((project) => project.id !== INBOX_PROJECT.id);
  const sortedProjects = applyOrder(otherProjects, projectOrder);

  return inbox ? [inbox, ...sortedProjects] : sortedProjects;
};

const applyNoteTodayOrder = (
  notes: readonly Note[],
  noteTodayOrder: readonly string[],
): string[] => {
  const pinnedNoteIds = new Set(
    notes.filter((note) => note.isPinnedToToday).map((note) => note.id),
  );
  const orderedPinnedNoteIds = noteTodayOrder.filter((id) => pinnedNoteIds.has(id));
  const missingPinnedNoteIds = [...pinnedNoteIds].filter(
    (id) => !orderedPinnedNoteIds.includes(id),
  );

  return [...orderedPinnedNoteIds, ...missingPinnedNoteIds];
};

const applyOrder = <T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] => {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = order
    .map((id) => itemsById.get(id))
    .filter((item): item is T => !!item);
  const orderedItemIds = new Set(orderedItems.map((item) => item.id));
  const unorderedItems = items.filter((item) => !orderedItemIds.has(item.id));

  return [...orderedItems, ...unorderedItems];
};

const archivedTasksForBucket = (
  archivedTasks: readonly SolidArchivedTask[],
  bucket: SolidArchiveBucket,
): Task[] =>
  archivedTasks
    .filter((archivedTask) => archivedTask.bucket === bucket)
    .map((archivedTask) => archivedTask.task)
    .sort((a, b) => a.id.localeCompare(b.id));
