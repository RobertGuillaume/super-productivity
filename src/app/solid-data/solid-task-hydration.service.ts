import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Log } from '../core/log';
import { Task } from '../features/tasks/task.model';
import { initialTaskState } from '../features/tasks/store/task.reducer';
import { taskAdapter } from '../features/tasks/store/task.adapter';
import { AppDataComplete, MODEL_CONFIGS } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SolidTaskRepository } from './solid-task.repository';

@Injectable({ providedIn: 'root' })
export class SolidTaskHydrationService {
  private readonly store = inject(Store);
  private readonly taskRepository = inject(SolidTaskRepository);

  async hydrateStore(): Promise<void> {
    const tasks = await this.taskRepository.loadTasks();
    const appDataComplete = createSolidTaskAppData(tasks);

    this.store.dispatch(loadAllData({ appDataComplete }));
    Log.normal(`Solid data layer hydrated task count: ${tasks.length}`);
  }
}

export const createSolidTaskAppData = (tasks: readonly Task[]): AppDataComplete => {
  const appDataComplete = Object.fromEntries(
    Object.entries(MODEL_CONFIGS).map(([key, config]) => [key, config.defaultData]),
  ) as AppDataComplete;

  return {
    ...appDataComplete,
    task: taskAdapter.setAll([...tasks], initialTaskState),
  };
};
