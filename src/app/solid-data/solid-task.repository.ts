import { inject, Injectable } from '@angular/core';
import { RuntimeError, type Thing, type Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
import { SP_TASK } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import {
  solidTaskQuery,
  solidThingToTask,
  taskToSolidChanges,
  taskToSolidCreateInput,
} from './solid-task.mapper';
import { SolidTaskAccessService } from './solid-task-access.service';

@Injectable({ providedIn: 'root' })
export class SolidTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly taskAccess = inject(SolidTaskAccessService);
  private readonly taskThingUris = new Map<string, string>();

  async loadTasks(): Promise<SolidRepositoryRead<Task[]>> {
    const result = await this.solidRuntime.client.things.query(solidTaskQuery, {
      scope: { kind: 'runtime-graph' },
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things.map((thing) => this.rememberTaskThing(thing)),
      result.metadata,
    );
  }

  saveTask(task: Task): Promise<Task> {
    return this.mutationCoordinator.run(solidMutationKey('task', task.id), () =>
      this.saveTaskNow(task),
    );
  }

  createTask(task: Task): Promise<Task> {
    return this.mutationCoordinator.run(solidMutationKey('task', task.id), () =>
      this.createTaskNow(task),
    );
  }

  updateTask(task: Task): Promise<Task> {
    return this.mutationCoordinator.run(solidMutationKey('task', task.id), () =>
      this.updateTaskNow(task, this.thingUriForUpdate(task.id)),
    );
  }

  deleteTask(taskId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('task', taskId), async () => {
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
      return this.createTaskNow(task);
    }

    return this.updateTaskNow(task, existingThingUri);
  }

  private async createTaskNow(task: Task): Promise<Task> {
    try {
      const created = await this.solidRuntime.client.things.create(
        taskToSolidCreateInput(task, this.solidRuntime.taskProfile),
      );
      return this.rememberTaskThing(created);
    } catch (error) {
      if (!isResourceAlreadyExistsError(error)) {
        throw error;
      }

      const resourceUri = existingResourceUri(error);
      if (resourceUri !== null) {
        await this.solidRuntime.client.discovery.refresh({ uris: [resourceUri] });
      }
      const thingUri = await this.findTaskThingUri(task.id);
      const podThing =
        thingUri === null ? null : await this.solidRuntime.client.things.get(thingUri);
      if (podThing === null) {
        throw error;
      }
      return this.rememberTaskThing(podThing);
    }
  }

  private async updateTaskNow(task: Task, existingThingUri: string): Promise<Task> {
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

  private thingUriForUpdate(taskId: string): string {
    const remembered = this.taskThingUris.get(taskId);
    if (remembered !== undefined) {
      return remembered;
    }
    if (isAbsoluteUri(taskId)) {
      return taskId;
    }

    const containerUri = this.solidRuntime.taskProfile.target?.containerUri;
    if (containerUri === undefined) {
      throw new Error('Solid task profile has no target container');
    }
    return new URL(`${safeResourceName(taskId)}.ttl#it`, containerUri).toString();
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
    this.taskAccess.registerThing(task.id, thing);
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

const safeResourceName = (value: string): string => {
  const lastSegment = value.split(/[\\/]/u).filter(Boolean).at(-1) ?? 'thing';
  const plainSegment = lastSegment.split(/[?#]/u)[0] ?? 'thing';
  return (
    plainSegment
      .trim()
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'thing'
  ).replace(/\.ttl$/u, '');
};

const isResourceAlreadyExistsError = (error: unknown): error is RuntimeError =>
  error instanceof RuntimeError && error.code === 'resource-already-exists';

const existingResourceUri = (error: RuntimeError): string | null => {
  const uri = error.details?.['uri'];
  return typeof uri === 'string' ? uri : null;
};
