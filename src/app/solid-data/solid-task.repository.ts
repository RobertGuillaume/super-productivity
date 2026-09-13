import { inject, Injectable } from '@angular/core';
import { type Thing, type Unsubscribe } from '@solid-intents/runtime';
import { Task } from '../features/tasks/task.model';
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
import {
  SolidRepositoryMutation,
  SolidRepositoryOperations,
} from './solid-repository-operations.service';

@Injectable({ providedIn: 'root' })
export class SolidTaskRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly taskAccess = inject(SolidTaskAccessService);
  private readonly operations = inject(SolidRepositoryOperations);

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
      this.updateTaskNow(task),
    );
  }

  deleteTask(taskId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('task', taskId), () =>
      this.operations.delete('task', taskId, this.solidRuntime.taskProfile, taskId),
    );
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
    return this.operations.upsert(this.taskMutation(task));
  }

  private async createTaskNow(task: Task): Promise<Task> {
    return this.operations.create(this.taskMutation(task));
  }

  private async updateTaskNow(task: Task): Promise<Task> {
    return this.operations.update(this.taskMutation(task));
  }

  private taskMutation(task: Task): SolidRepositoryMutation<Task> {
    return {
      model: 'task',
      id: task.id,
      value: task,
      resourceName: task.id,
      profile: this.solidRuntime.taskProfile,
      createInput: taskToSolidCreateInput(task, this.solidRuntime.taskProfile),
      changes: taskToSolidChanges(task),
      map: (thing) => this.rememberTaskThing(thing),
    };
  }

  private rememberTaskThing(thing: Thing): Task {
    const task = solidThingToTask(thing);
    this.taskAccess.registerThing(task.id, thing);
    return this.operations.remember('task', task.id, thing, task);
  }
}
