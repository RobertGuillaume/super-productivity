import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
import { SP_ARCHIVED_TASK } from './solid-productivity-vocab';
import {
  archivedTaskToSolidChanges,
  archivedTaskToSolidCreateInput,
  archivedTaskResourceName,
  SolidArchiveBucket,
  SolidArchivedTask,
  solidArchivedTaskQuery,
  solidThingToArchivedTask,
} from './solid-archived-task.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  settleSolidMutations,
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidArchivedTaskContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidArchivedTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadArchivedTasks(): Promise<SolidRepositoryRead<SolidArchivedTask[]>> {
    const archivedTaskContainerScope = this.archivedTaskContainerScope();

    const result = await this.solidRuntime.client.things.query(solidArchivedTaskQuery, {
      scope: archivedTaskContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things.map((thing) => {
        const archivedTask = solidThingToArchivedTask(thing);
        return this.operations.remember(
          'archivedTask',
          archivedTaskKey(archivedTask),
          thing,
          archivedTask,
        );
      }),
      result.metadata,
    );
  }

  saveArchivedTask(task: Task, bucket: SolidArchiveBucket = 'young'): Promise<Task> {
    return this.mutationCoordinator.run(solidMutationKey('archivedTask', task.id), () =>
      this.saveArchivedTaskNow(task, bucket),
    );
  }

  deleteArchivedTask(taskId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('archivedTask', taskId), () =>
      this.deleteArchivedTaskNow(taskId),
    );
  }

  deleteArchivedTasks(taskIds: readonly string[]): Promise<void> {
    return this.mutationCoordinator.run(
      taskIds.map((taskId) => solidMutationKey('archivedTask', taskId)),
      () => this.deleteArchivedTasksNow(taskIds),
    );
  }

  replaceArchivedTasks(archivedTasks: readonly SolidArchivedTask[]): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('archivedTask', '*'), () =>
      this.replaceArchivedTasksNow(archivedTasks),
    );
  }

  private async saveArchivedTaskNow(
    task: Task,
    bucket: SolidArchiveBucket,
  ): Promise<Task> {
    const archivedTask: SolidArchivedTask = { task, bucket };
    const saved = await this.operations.upsert({
      model: 'archivedTask',
      id: archivedTaskKey(archivedTask),
      value: archivedTask,
      resourceName: archivedTaskResourceName(task.id, bucket),
      profile: this.solidRuntime.archivedTaskProfile,
      createInput: archivedTaskToSolidCreateInput(
        archivedTask,
        this.solidRuntime.archivedTaskProfile,
      ),
      changes: archivedTaskToSolidChanges(archivedTask),
      map: solidThingToArchivedTask,
    });
    return saved.task;
  }

  private async deleteArchivedTaskNow(taskId: string): Promise<void> {
    await settleSolidMutations(
      (['young', 'old'] as const).map((bucket) =>
        this.operations.delete(
          'archivedTask',
          `${bucket}:${taskId}`,
          this.solidRuntime.archivedTaskProfile,
          archivedTaskResourceName(taskId, bucket),
        ),
      ),
    );
  }

  private async deleteArchivedTasksNow(taskIds: readonly string[]): Promise<void> {
    await settleSolidMutations(
      taskIds.map((taskId) => this.deleteArchivedTaskNow(taskId)),
    );
  }

  private async replaceArchivedTasksNow(
    archivedTasks: readonly SolidArchivedTask[],
  ): Promise<void> {
    const existingThings = await this.findAllArchivedTaskThings();
    const desiredKeys = new Set(
      archivedTasks.map((archivedTask) => archivedTaskKey(archivedTask)),
    );

    await settleSolidMutations(
      archivedTasks.map((archivedTask) =>
        this.saveArchivedTaskNow(archivedTask.task, archivedTask.bucket),
      ),
    );

    await settleSolidMutations(
      existingThings
        .filter(
          (thing) => !desiredKeys.has(archivedTaskKey(solidThingToArchivedTask(thing))),
        )
        .map((thing) => {
          const archivedTask = solidThingToArchivedTask(thing);
          const key = archivedTaskKey(archivedTask);
          this.operations.remember('archivedTask', key, thing, archivedTask);
          return this.operations.delete(
            'archivedTask',
            key,
            this.solidRuntime.archivedTaskProfile,
            archivedTaskResourceName(archivedTask.task.id, archivedTask.bucket),
          );
        }),
    );
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
        autoDiscover: false,
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
        autoDiscover: false,
      },
    );

    return result.things;
  }

  private async findAllArchivedTaskThings(): Promise<Thing[]> {
    const result = await this.solidRuntime.client.things.query(solidArchivedTaskQuery, {
      scope: this.archivedTaskContainerScope(),
      autoDiscover: false,
    });

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

const archivedTaskKey = (archivedTask: SolidArchivedTask): string =>
  `${archivedTask.bucket}:${archivedTask.task.id}`;
