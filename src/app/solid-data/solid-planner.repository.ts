import { inject, Injectable } from '@angular/core';
import type {
  RuntimeScope,
  Thing,
  ThingQueryResult,
  Unsubscribe,
} from '@solid-intents/runtime';
import { PlannerState } from '../features/planner/store/planner.reducer';
import {
  createPlannerStateFromSolid,
  createSolidPlannerState,
  plannerDayToSolidChanges,
  plannerDayToSolidCreateInput,
  plannerStateToSolidChanges,
  plannerStateToSolidCreateInput,
  SOLID_PLANNER_STATE_ID,
  SolidPlannerDay,
  solidPlannerDayQuery,
  solidPlannerStateQuery,
  solidThingToPlannerDay,
  solidThingToPlannerState,
} from './solid-planner.mapper';
import { SP_PLANNER_DAY, SP_PLANNER_STATE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidPlannerContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidPlannerRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadPlannerState(): Promise<SolidRepositoryRead<PlannerState>> {
    const plannerContainerScope = this.plannerContainerScope();

    const [daysResult, stateResult] = await Promise.all([
      this.solidRuntime.client.things.query(solidPlannerDayQuery, {
        scope: plannerContainerScope,
        autoDiscover: false,
      }),
      this.queryPlannerStateThing(),
    ]);
    const stateThing = stateResult.things[0] ?? null;

    return solidRepositoryRead(
      createPlannerStateFromSolid(
        daysResult.things.map(solidThingToPlannerDay),
        stateThing === null ? null : solidThingToPlannerState(stateThing),
      ),
      daysResult.metadata,
      stateResult.metadata,
    );
  }

  async savePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    await this.replacePlannerState(plannerState);
    return plannerState;
  }

  replacePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    return this.writeQueue.enqueue(() => this.replacePlannerStateNow(plannerState));
  }

  reconcilePlannerDays(plannerState: PlannerState): Promise<PlannerState> {
    return this.writeQueue.enqueue(() => this.reconcilePlannerDaysNow(plannerState));
  }

  savePlannerDay(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    return this.writeQueue.enqueue(() => this.savePlannerDayNow(plannerDay));
  }

  deletePlannerDay(day: string): Promise<void> {
    return this.writeQueue.enqueue(() => this.deletePlannerDayNow(day));
  }

  savePlannerDialogState(
    addPlannedTasksDialogLastShown: string | undefined,
  ): Promise<void> {
    return this.writeQueue.enqueue(() =>
      this.savePlannerDialogStateNow(addPlannedTasksDialogLastShown),
    );
  }

  private async replacePlannerStateNow(
    plannerState: PlannerState,
  ): Promise<PlannerState> {
    const existingDays = await this.loadPlannerDays();
    const nextDays = new Set(Object.keys(plannerState.days));

    await Promise.all([
      ...existingDays
        .filter((plannerDay) => !nextDays.has(plannerDay.day))
        .map((plannerDay) => this.deletePlannerDayNow(plannerDay.day)),
      ...Object.entries(plannerState.days).map(([day, taskIds]) =>
        this.savePlannerDayNow({ day, taskIds, updated: Date.now() }),
      ),
      this.savePlannerDialogStateNow(plannerState.addPlannedTasksDialogLastShown),
    ]);

    return plannerState;
  }

  private async reconcilePlannerDaysNow(
    plannerState: PlannerState,
  ): Promise<PlannerState> {
    const result = await this.solidRuntime.client.things.query(solidPlannerDayQuery, {
      scope: this.plannerContainerScope(),
      autoDiscover: false,
    });
    const existingByDay = new Map(
      result.things.map((thing) => [solidThingToPlannerDay(thing).day, thing]),
    );

    const operations: Promise<unknown>[] = [];

    for (const thing of result.things) {
      const existingDay = solidThingToPlannerDay(thing);
      const nextTaskIds = plannerState.days[existingDay.day];

      if (nextTaskIds === undefined) {
        operations.push(this.solidRuntime.client.things.delete(thing.uri));
      } else if (!arraysEqual(existingDay.taskIds, nextTaskIds)) {
        operations.push(
          this.updatePlannerDayThing(thing, {
            day: existingDay.day,
            taskIds: nextTaskIds,
            updated: Date.now(),
          }),
        );
      }
    }

    for (const [day, taskIds] of Object.entries(plannerState.days)) {
      if (!existingByDay.has(day)) {
        operations.push(this.createPlannerDay({ day, taskIds, updated: Date.now() }));
      }
    }

    await Promise.all(operations);

    return plannerState;
  }

  async loadPlannerDays(): Promise<SolidPlannerDay[]> {
    const result = await this.solidRuntime.client.things.query(solidPlannerDayQuery, {
      scope: this.plannerContainerScope(),
      autoDiscover: false,
    });

    return result.things.map(solidThingToPlannerDay);
  }

  private async savePlannerDayNow(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    const existingThing = await this.findPlannerDayThing(plannerDay.day);

    if (existingThing === null) {
      return this.createPlannerDay(plannerDay);
    }

    return this.updatePlannerDayThing(existingThing, plannerDay);
  }

  private async createPlannerDay(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    const created = await this.solidRuntime.client.things.create(
      plannerDayToSolidCreateInput(plannerDay, this.solidRuntime.plannerDayProfile),
    );
    return solidThingToPlannerDay(created);
  }

  private async updatePlannerDayThing(
    existingThing: Thing,
    plannerDay: SolidPlannerDay,
  ): Promise<SolidPlannerDay> {
    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      plannerDayToSolidChanges(plannerDay),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid planner day update commit, received ${commit.kind}`,
      );
    }

    return solidThingToPlannerDay(commit.result);
  }

  private async deletePlannerDayNow(day: string): Promise<void> {
    const existingThing = await this.findPlannerDayThing(day);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  private async savePlannerDialogStateNow(
    addPlannedTasksDialogLastShown: string | undefined,
  ): Promise<void> {
    const existingThing = await this.findPlannerStateThing();
    const nextState = createSolidPlannerState(addPlannedTasksDialogLastShown);

    if (existingThing === null) {
      await this.solidRuntime.client.things.create(
        plannerStateToSolidCreateInput(nextState, this.solidRuntime.plannerStateProfile),
      );
      return;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      plannerStateToSolidChanges(nextState),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid planner state update commit, received ${commit.kind}`,
      );
    }
  }

  subscribePlannerState(listener: (plannerState: PlannerState) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidPlannerDayQuery,
      async (result) => {
        const stateThing = await this.findPlannerStateThing();
        listener(
          createPlannerStateFromSolid(
            result.things.map(solidThingToPlannerDay),
            stateThing === null ? null : solidThingToPlannerState(stateThing),
          ),
        );
      },
      {
        emitInitial: true,
      },
    );
  }

  private async findPlannerDayThing(day: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidPlannerDayQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_PLANNER_DAY.day,
            value: day,
          },
        ],
      },
      {
        limit: 1,
        scope: this.plannerContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private async findPlannerStateThing(): Promise<Thing | null> {
    const result = await this.queryPlannerStateThing();
    return result.things[0] ?? null;
  }

  private queryPlannerStateThing(): Promise<ThingQueryResult> {
    return this.solidRuntime.client.things.query(
      {
        ...solidPlannerStateQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_PLANNER_STATE.id,
            value: SOLID_PLANNER_STATE_ID,
          },
        ],
      },
      {
        limit: 1,
        scope: this.plannerContainerScope(),
        autoDiscover: false,
      },
    );
  }

  private plannerContainerScope(): SolidPlannerContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.planner,
    };
  }
}

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
