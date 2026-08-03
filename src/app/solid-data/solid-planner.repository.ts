import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
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

type SolidPlannerContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidPlannerRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadPlannerState(): Promise<PlannerState> {
    const plannerContainerScope = this.plannerContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [plannerContainerScope.uri],
      mode: 'balanced',
    });

    const [daysResult, stateThing] = await Promise.all([
      this.solidRuntime.client.things.query(solidPlannerDayQuery, {
        scope: plannerContainerScope,
        autoDiscover: true,
      }),
      this.findPlannerStateThing(),
    ]);

    return createPlannerStateFromSolid(
      daysResult.things.map(solidThingToPlannerDay),
      stateThing === null ? null : solidThingToPlannerState(stateThing),
    );
  }

  async savePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    await this.replacePlannerState(plannerState);
    return plannerState;
  }

  async replacePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    const existingDays = await this.loadPlannerDays();
    const nextDays = new Set(Object.keys(plannerState.days));

    await Promise.all([
      ...existingDays
        .filter((plannerDay) => !nextDays.has(plannerDay.day))
        .map((plannerDay) => this.deletePlannerDay(plannerDay.day)),
      ...Object.entries(plannerState.days).map(([day, taskIds]) =>
        this.savePlannerDay({ day, taskIds, updated: Date.now() }),
      ),
      this.savePlannerDialogState(plannerState.addPlannedTasksDialogLastShown),
    ]);

    return plannerState;
  }

  async loadPlannerDays(): Promise<SolidPlannerDay[]> {
    const result = await this.solidRuntime.client.things.query(solidPlannerDayQuery, {
      scope: this.plannerContainerScope(),
      autoDiscover: true,
    });

    return result.things.map(solidThingToPlannerDay);
  }

  async savePlannerDay(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    const existingThing = await this.findPlannerDayThing(plannerDay.day);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        plannerDayToSolidCreateInput(plannerDay, this.solidRuntime.plannerDayProfile),
      );
      return solidThingToPlannerDay(created);
    }

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

  async deletePlannerDay(day: string): Promise<void> {
    const existingThing = await this.findPlannerDayThing(day);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  async savePlannerDialogState(
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
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private async findPlannerStateThing(): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
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
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private plannerContainerScope(): SolidPlannerContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.planner,
    };
  }
}
