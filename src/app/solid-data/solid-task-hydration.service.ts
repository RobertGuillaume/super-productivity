import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Log } from '../core/log';
import { Metric } from '../features/metric/metric.model';
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
import { PlannerState } from '../features/planner/store/planner.reducer';
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
import { initialTimeTrackingState } from '../features/time-tracking/store/time-tracking.reducer';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { initialTagState, tagAdapter } from '../features/tag/store/tag.reducer';
import { AppDataComplete, MODEL_CONFIGS } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SolidArchivedTask, SolidArchiveBucket } from './solid-archived-task.mapper';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidAppState } from './solid-app-state.mapper';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidMetricRepository } from './solid-metric.repository';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidSimpleCounterRepository } from './solid-simple-counter.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';

@Injectable({ providedIn: 'root' })
export class SolidTaskHydrationService {
  private readonly store = inject(Store);
  private readonly taskRepository = inject(SolidTaskRepository);
  private readonly archivedTaskRepository = inject(SolidArchivedTaskRepository);
  private readonly projectRepository = inject(SolidProjectRepository);
  private readonly plannerRepository = inject(SolidPlannerRepository);
  private readonly tagRepository = inject(SolidTagRepository);
  private readonly noteRepository = inject(SolidNoteRepository);
  private readonly issueProviderRepository = inject(SolidIssueProviderRepository);
  private readonly metricRepository = inject(SolidMetricRepository);
  private readonly sectionRepository = inject(SolidSectionRepository);
  private readonly taskRepeatCfgRepository = inject(SolidTaskRepeatCfgRepository);
  private readonly simpleCounterRepository = inject(SolidSimpleCounterRepository);
  private readonly appStateRepository = inject(SolidAppStateRepository);

  async hydrateStore(): Promise<void> {
    const [
      tasks,
      archivedTasks,
      projects,
      tags,
      notes,
      sections,
      issueProviders,
      taskRepeatCfgs,
      simpleCounters,
      metrics,
      plannerState,
      appState,
    ] = await Promise.all([
      this.taskRepository.loadTasks(),
      this.archivedTaskRepository.loadArchivedTasks(),
      this.projectRepository.loadProjects(),
      this.tagRepository.loadTags(),
      this.noteRepository.loadNotes(),
      this.sectionRepository.loadSections(),
      this.issueProviderRepository.loadIssueProviders(),
      this.taskRepeatCfgRepository.loadTaskRepeatCfgs(),
      this.simpleCounterRepository.loadSimpleCounters(),
      this.metricRepository.loadMetrics(),
      this.plannerRepository.loadPlannerState(),
      this.appStateRepository.loadAppState(),
    ]);
    const appDataComplete = createSolidAppData({
      tasks,
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
      appState,
    });

    this.store.dispatch(loadAllData({ appDataComplete }));
    Log.normal(
      `Solid data layer hydrated task count: ${tasks.length}, ` +
        `project count: ${projects.length}, tag count: ${tags.length}, ` +
        `note count: ${notes.length}, section count: ${sections.length}, ` +
        `issue provider count: ${issueProviders.length}, ` +
        `repeat config count: ${taskRepeatCfgs.length}, ` +
        `simple counter count: ${simpleCounters.length}, ` +
        `metric count: ${metrics.length}, ` +
        `archived task count: ${archivedTasks.length}, ` +
        `planner day count: ${Object.keys(plannerState.days).length}`,
    );
  }
}

export const createSolidAppData = (input: {
  tasks: readonly Task[];
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
  appState?: SolidAppState | null;
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
    archiveYoung: {
      ...appDataComplete.archiveYoung,
      task: taskAdapter.setAll(archiveYoungTasks, initialTaskState),
      timeTracking: initialTimeTrackingState,
    },
    archiveOld: {
      ...appDataComplete.archiveOld,
      task: taskAdapter.setAll(archiveOldTasks, initialTaskState),
      timeTracking: initialTimeTrackingState,
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
