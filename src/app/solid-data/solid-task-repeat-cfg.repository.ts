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
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidTaskRepeatCfgContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTaskRepeatCfgRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadTaskRepeatCfgs(): Promise<TaskRepeatCfg[]> {
    const taskRepeatCfgContainerScope = this.taskRepeatCfgContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [taskRepeatCfgContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidTaskRepeatCfgQuery, {
      scope: taskRepeatCfgContainerScope,
      autoDiscover: true,
    });

    return result.things.map(solidThingToTaskRepeatCfg);
  }

  saveTaskRepeatCfg(taskRepeatCfg: TaskRepeatCfg): Promise<TaskRepeatCfg> {
    return this.writeQueue.enqueue(() => this.saveTaskRepeatCfgNow(taskRepeatCfg));
  }

  deleteTaskRepeatCfg(taskRepeatCfgId: string): Promise<void> {
    return this.writeQueue.enqueue(() => this.deleteTaskRepeatCfgNow(taskRepeatCfgId));
  }

  private async saveTaskRepeatCfgNow(
    taskRepeatCfg: TaskRepeatCfg,
  ): Promise<TaskRepeatCfg> {
    const existingThing = await this.findTaskRepeatCfgThing(taskRepeatCfg.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        taskRepeatCfgToSolidCreateInput(
          taskRepeatCfg,
          this.solidRuntime.taskRepeatCfgProfile,
        ),
      );
      return solidThingToTaskRepeatCfg(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      taskRepeatCfgToSolidChanges(taskRepeatCfg),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid task repeat config update commit, received ${commit.kind}`,
      );
    }

    return solidThingToTaskRepeatCfg(commit.result);
  }

  private async deleteTaskRepeatCfgNow(taskRepeatCfgId: string): Promise<void> {
    const existingThing = await this.findTaskRepeatCfgThing(taskRepeatCfgId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
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
        autoDiscover: true,
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
