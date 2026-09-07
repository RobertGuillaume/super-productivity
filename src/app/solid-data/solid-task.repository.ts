import { inject, Injectable } from '@angular/core';
import type { Thing, Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
import { SOLID_PRODUCTIVITY_TASK_TYPE, SP_TASK } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidWriteQueueService } from './solid-write-queue.service';
import {
  solidTaskQuery,
  solidThingToTask,
  taskToSolidChanges,
  taskToSolidCreateInput,
} from './solid-task.mapper';

@Injectable({ providedIn: 'root' })
export class SolidTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);
  private readonly taskThingUris = new Map<string, string>();

  async loadTasks(): Promise<Task[]> {
    await this.solidRuntime.client.discovery.refresh({
      uris: [this.solidRuntime.ensureLayout().containers.tasks],
    });
    await this.solidRuntime.client.discovery.discoverType(SOLID_PRODUCTIVITY_TASK_TYPE);

    const result = await this.solidRuntime.client.things.query(solidTaskQuery, {
      scope: { kind: 'runtime-graph' },
      autoDiscover: false,
    });

    return result.things.map((thing) => this.rememberTaskThing(thing));
  }

  saveTask(task: Task): Promise<Task> {
    return this.writeQueue.enqueue(() => this.saveTaskNow(task));
  }

  deleteTask(taskId: string): Promise<void> {
    return this.writeQueue.enqueue(async () => {
      const existingThingUri = await this.findTaskThingUri(taskId);
      if (existingThingUri !== null) {
        await this.solidRuntime.client.things.delete(existingThingUri);
        this.taskThingUris.delete(taskId);
      }
    });
  }

  subscribeTasks(listener: (tasks: Task[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidTaskQuery,
      (result) => listener(result.things.map((thing) => this.rememberTaskThing(thing))),
      {
        emitInitial: true,
      },
    );
  }

  private async saveTaskNow(task: Task): Promise<Task> {
    const existingThingUri = await this.findTaskThingUri(task.id);

    if (existingThingUri === null) {
      const created = await this.solidRuntime.client.things.create(
        taskToSolidCreateInput(task, this.solidRuntime.taskProfile),
      );
      return this.rememberTaskThing(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThingUri,
      taskToSolidChanges(task),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid task update commit, received ${commit.kind}`);
    }

    return this.rememberTaskThing(commit.result);
  }

  private async findTaskThingUri(taskId: string): Promise<string | null> {
    const knownThingUri = this.taskThingUris.get(taskId);
    if (knownThingUri !== undefined) {
      return knownThingUri;
    }

    if (isAbsoluteUri(taskId)) {
      return taskId;
    }

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
        scope: { kind: 'runtime-graph' },
        autoDiscover: false,
      },
    );

    const thing = result.things[0];
    if (thing === undefined) {
      return null;
    }
    this.rememberTaskThing(thing);
    return thing.uri;
  }

  private rememberTaskThing(thing: Thing): Task {
    const task = solidThingToTask(thing);
    this.taskThingUris.set(task.id, thing.uri);
    return task;
  }
}

const isAbsoluteUri = (value: string): boolean => {
  try {
    return new URL(value).protocol !== '';
  } catch {
    return false;
  }
};
