import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { TaskRepeatCfg } from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { SP_TASK_REPEAT_CFG } from './solid-productivity-vocab';
import {
  solidTaskRepeatCfgQuery,
  solidThingToTaskRepeatCfg,
  taskRepeatCfgToSolidChanges,
  taskRepeatCfgToSolidCreateInput,
} from './solid-task-repeat-cfg.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import type { SolidMutationIntentContext } from './solid-mutation-intent-registry.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidTaskRepeatCfgContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTaskRepeatCfgRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadTaskRepeatCfgs(): Promise<SolidRepositoryRead<TaskRepeatCfg[]>> {
    const taskRepeatCfgContainerScope = this.taskRepeatCfgContainerScope();

    const result = await this.solidRuntime.client.things.query(solidTaskRepeatCfgQuery, {
      scope: taskRepeatCfgContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things.map((thing) => {
        const config = solidThingToTaskRepeatCfg(thing);
        return this.operations.remember('taskRepeatCfg', config.id, thing, config);
      }),
      result.metadata,
    );
  }

  saveTaskRepeatCfg(
    taskRepeatCfg: TaskRepeatCfg,
    context = this.systemContext(taskRepeatCfg.id),
  ): Promise<TaskRepeatCfg> {
    return this.mutationCoordinator.run(
      solidMutationKey('taskRepeatCfg', taskRepeatCfg.id),
      context,
      () => this.saveTaskRepeatCfgNow(taskRepeatCfg),
    );
  }

  deleteTaskRepeatCfg(
    taskRepeatCfgId: string,
    context = this.systemContext(taskRepeatCfgId),
  ): Promise<void> {
    return this.mutationCoordinator.run(
      solidMutationKey('taskRepeatCfg', taskRepeatCfgId),
      context,
      () => this.deleteTaskRepeatCfgNow(taskRepeatCfgId),
    );
  }

  private systemContext(id: string): SolidMutationIntentContext {
    return this.mutationCoordinator.systemContext('task-repeat-cfg-repository', [
      solidMutationKey('taskRepeatCfg', id),
    ]);
  }

  private async saveTaskRepeatCfgNow(
    taskRepeatCfg: TaskRepeatCfg,
  ): Promise<TaskRepeatCfg> {
    return this.operations.upsert({
      model: 'taskRepeatCfg',
      id: taskRepeatCfg.id,
      value: taskRepeatCfg,
      resourceName: taskRepeatCfg.id,
      profile: this.solidRuntime.taskRepeatCfgProfile,
      createInput: taskRepeatCfgToSolidCreateInput(
        taskRepeatCfg,
        this.solidRuntime.taskRepeatCfgProfile,
      ),
      changes: taskRepeatCfgToSolidChanges(taskRepeatCfg),
      map: solidThingToTaskRepeatCfg,
    });
  }

  private async deleteTaskRepeatCfgNow(taskRepeatCfgId: string): Promise<void> {
    await this.operations.delete(
      'taskRepeatCfg',
      taskRepeatCfgId,
      this.solidRuntime.taskRepeatCfgProfile,
      taskRepeatCfgId,
    );
  }

  subscribeTaskRepeatCfgs(
    listener: (taskRepeatCfgs: TaskRepeatCfg[]) => void,
  ): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidTaskRepeatCfgQuery,
      (result) => listener(result.things.map(solidThingToTaskRepeatCfg)),
      {
        emitInitial: true,
      },
    );
  }

  private async findTaskRepeatCfgThing(taskRepeatCfgId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidTaskRepeatCfgQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_TASK_REPEAT_CFG.id,
            value: taskRepeatCfgId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.taskRepeatCfgContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private taskRepeatCfgContainerScope(): SolidTaskRepeatCfgContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.taskRepeatCfgs,
    };
  }
}
