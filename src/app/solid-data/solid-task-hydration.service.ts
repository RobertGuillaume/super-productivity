import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Log } from '../core/log';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import {
  initialProjectState,
  projectAdapter,
} from '../features/project/store/project.reducer';
import { Task } from '../features/tasks/task.model';
import { initialTaskState } from '../features/tasks/store/task.reducer';
import { taskAdapter } from '../features/tasks/store/task.adapter';
import { AppDataComplete, MODEL_CONFIGS } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable({ providedIn: 'root' })
export class SolidTaskHydrationService {
  private readonly store = inject(Store);
  private readonly taskRepository = inject(SolidTaskRepository);
  private readonly projectRepository = inject(SolidProjectRepository);

  async hydrateStore(): Promise<void> {
    const [tasks, projects] = await Promise.all([
      this.taskRepository.loadTasks(),
      this.projectRepository.loadProjects(),
    ]);
    const appDataComplete = createSolidAppData({
      tasks,
      projects,
    });

    this.store.dispatch(loadAllData({ appDataComplete }));
    Log.normal(
      `Solid data layer hydrated task count: ${tasks.length}, project count: ${projects.length}`,
    );
  }
}

export const createSolidAppData = (input: {
  tasks: readonly Task[];
  projects: readonly Project[];
}): AppDataComplete => {
  const appDataComplete = Object.fromEntries(
    Object.entries(MODEL_CONFIGS).map(([key, config]) => [key, config.defaultData]),
  ) as AppDataComplete;
  const projects = ensureInboxProject(input.projects);

  return {
    ...appDataComplete,
    task: taskAdapter.setAll([...input.tasks], initialTaskState),
    project: projectAdapter.setAll(projects, initialProjectState),
  };
};

const ensureInboxProject = (projects: readonly Project[]): Project[] =>
  projects.some((project) => project.id === INBOX_PROJECT.id)
    ? [...projects]
    : [INBOX_PROJECT, ...projects];
