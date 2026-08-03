import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
import { SP_ARCHIVED_TASK } from './solid-productivity-vocab';
import {
  archivedTaskToSolidChanges,
  archivedTaskToSolidCreateInput,
  SolidArchiveBucket,
  SolidArchivedTask,
  solidArchivedTaskQuery,
  solidThingToArchivedTask,
} from './solid-archived-task.mapper';
import { SolidRuntimeService } from './solid-runtime.service';

type SolidArchivedTaskContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidArchivedTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadArchivedTasks(): Promise<SolidArchivedTask[]> {
    const archivedTaskContainerScope = this.archivedTaskContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [archivedTaskContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidArchivedTaskQuery, {
      scope: archivedTaskContainerScope,
      autoDiscover: true,
    });

    return result.things.map(solidThingToArchivedTask);
  }

  async saveArchivedTask(
    task: Task,
    bucket: SolidArchiveBucket = 'young',
  ): Promise<Task> {
    const archivedTask: SolidArchivedTask = { task, bucket };
    const existingThing = await this.findArchivedTaskThing(task.id, bucket);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        archivedTaskToSolidCreateInput(
          archivedTask,
          this.solidRuntime.archivedTaskProfile,
        ),
      );
      return solidThingToArchivedTask(created).task;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      archivedTaskToSolidChanges(archivedTask),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid archived task update commit, received ${commit.kind}`,
      );
    }

    return solidThingToArchivedTask(commit.result).task;
  }

  async deleteArchivedTask(taskId: string): Promise<void> {
    const existingThings = await this.findArchivedTaskThings(taskId);
    await Promise.all(
      existingThings.map((thing) => this.solidRuntime.client.things.delete(thing.uri)),
    );
  }

  async deleteArchivedTasks(taskIds: readonly string[]): Promise<void> {
    await Promise.all(taskIds.map((taskId) => this.deleteArchivedTask(taskId)));
  }

  subscribeArchivedTasks(listener: (tasks: SolidArchivedTask[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidArchivedTaskQuery,
      (result) => listener(result.things.map(solidThingToArchivedTask)),
      {
        emitInitial: true,
      },
    );
  }

  private async findArchivedTaskThing(
    taskId: string,
    bucket: SolidArchiveBucket,
  ): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidArchivedTaskQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_ARCHIVED_TASK.id,
            value: taskId,
          },
          {
            kind: 'property',
            predicateUri: SP_ARCHIVED_TASK.bucket,
            value: bucket,
          },
        ],
      },
      {
        limit: 1,
        scope: this.archivedTaskContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private async findArchivedTaskThings(taskId: string): Promise<Thing[]> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidArchivedTaskQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_ARCHIVED_TASK.id,
            value: taskId,
          },
        ],
      },
      {
        scope: this.archivedTaskContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things;
  }

  private archivedTaskContainerScope(): SolidArchivedTaskContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.archivedTasks,
    };
  }
}
