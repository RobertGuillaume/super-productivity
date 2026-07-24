import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
import { SP_TASK } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  solidTaskQuery,
  solidThingToTask,
  taskToSolidChanges,
  taskToSolidCreateInput,
} from './solid-task.mapper';

type SolidTaskContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadTasks(): Promise<Task[]> {
    const taskContainerScope = this.taskContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [taskContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidTaskQuery, {
      scope: taskContainerScope,
      autoDiscover: true,
    });

    return result.things.map(solidThingToTask);
  }

  async saveTask(task: Task): Promise<Task> {
    const existingThing = await this.findTaskThing(task.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        taskToSolidCreateInput(task, this.solidRuntime.taskProfile),
      );
      return solidThingToTask(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      taskToSolidChanges(task),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid task update commit, received ${commit.kind}`);
    }

    return solidThingToTask(commit.result);
  }

  async deleteTask(taskId: string): Promise<void> {
    const existingThing = await this.findTaskThing(taskId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeTasks(listener: (tasks: Task[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidTaskQuery,
      (result) => listener(result.things.map(solidThingToTask)),
      {
        emitInitial: true,
      },
    );
  }

  private async findTaskThing(taskId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidTaskQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_TASK.id,
            value: taskId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.taskContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private taskContainerScope(): SolidTaskContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.tasks,
    };
  }
}
