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
  SOLID_PLANNER_STATE_RESOURCE_NAME,
  SolidPlannerDay,
  solidPlannerDayQuery,
  solidPlannerStateQuery,
  solidThingToPlannerDay,
  solidThingToPlannerState,
} from './solid-planner.mapper';
import { SP_PLANNER_STATE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import {
  settleSolidMutations,
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';

type SolidPlannerContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidPlannerRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadPlannerState(): Promise<SolidRepositoryRead<PlannerState>> {
    const plannerContainerScope = this.plannerContainerScope();

    const [daysResult, stateResult] = await Promise.all([
      this.solidRuntime.client.things.query(solidPlannerDayQuery, {
        scope: plannerContainerScope,
        autoDiscover: false,
      }),
      this.queryPlannerStateThing(),
    ]);
    const dayThings = daysResult.things;
    const stateThing = stateResult.things[0] ?? null;

    const days = dayThings.map((thing) => {
      const day = solidThingToPlannerDay(thing);
      return this.operations.remember('plannerDay', day.day, thing, day);
    });
    const plannerState =
      stateThing === null
        ? null
        : this.operations.remember(
            'plannerState',
            SOLID_PLANNER_STATE_ID,
            stateThing,
            solidThingToPlannerState(stateThing),
          );

    return solidRepositoryRead(
      createPlannerStateFromSolid(days, plannerState),
      daysResult.metadata,
      stateResult.metadata,
    );
  }

  async savePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    await this.replacePlannerState(plannerState);
    return plannerState;
  }

  replacePlannerState(plannerState: PlannerState): Promise<PlannerState> {
    return this.mutationCoordinator.run(solidMutationKey('planner', '*'), () =>
      this.replacePlannerStateNow(plannerState),
    );
  }

  reconcilePlannerDays(plannerState: PlannerState): Promise<PlannerState> {
    return this.mutationCoordinator.run(solidMutationKey('planner', '*'), () =>
      this.reconcilePlannerDaysNow(plannerState),
    );
  }

  savePlannerDay(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    return this.mutationCoordinator.run(solidMutationKey('planner', '*'), () =>
      this.savePlannerDayNow(plannerDay),
    );
  }

  deletePlannerDay(day: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('planner', '*'), () =>
      this.deletePlannerDayNow(day),
    );
  }

  savePlannerDialogState(
    addPlannedTasksDialogLastShown: string | undefined,
  ): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('planner', '*'), () =>
      this.savePlannerDialogStateNow(addPlannedTasksDialogLastShown),
    );
  }

  private async replacePlannerStateNow(
    plannerState: PlannerState,
  ): Promise<PlannerState> {
    const existingDays = await this.loadPlannerDays();
    const nextDays = new Set(Object.keys(plannerState.days));

    await settleSolidMutations([
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
    const things = result.things;
    const existingByDay = new Map(
      things.map((thing) => [solidThingToPlannerDay(thing).day, thing]),
    );

    const operations: Promise<unknown>[] = [];

    for (const thing of things) {
      const existingDay = solidThingToPlannerDay(thing);
      this.operations.remember('plannerDay', existingDay.day, thing, existingDay);
      const nextTaskIds = plannerState.days[existingDay.day];

      if (nextTaskIds === undefined) {
        operations.push(this.deletePlannerDayNow(existingDay.day));
      } else if (!arraysEqual(existingDay.taskIds, nextTaskIds)) {
        operations.push(
          this.savePlannerDayNow({
            day: existingDay.day,
            taskIds: nextTaskIds,
            updated: Date.now(),
          }),
        );
      }
    }

    for (const [day, taskIds] of Object.entries(plannerState.days)) {
      if (!existingByDay.has(day)) {
        operations.push(this.savePlannerDayNow({ day, taskIds, updated: Date.now() }));
      }
    }

    await settleSolidMutations(operations);

    return plannerState;
  }

  async loadPlannerDays(): Promise<SolidPlannerDay[]> {
    const result = await this.solidRuntime.client.things.query(solidPlannerDayQuery, {
      scope: this.plannerContainerScope(),
      autoDiscover: false,
    });

    return result.things.map((thing) => {
      const day = solidThingToPlannerDay(thing);
      return this.operations.remember('plannerDay', day.day, thing, day);
    });
  }

  private async savePlannerDayNow(plannerDay: SolidPlannerDay): Promise<SolidPlannerDay> {
    return this.operations.upsert({
      model: 'plannerDay',
      id: plannerDay.day,
      value: plannerDay,
      resourceName: plannerDay.day,
      profile: this.solidRuntime.plannerDayProfile,
      createInput: plannerDayToSolidCreateInput(
        plannerDay,
        this.solidRuntime.plannerDayProfile,
      ),
      changes: plannerDayToSolidChanges(plannerDay),
      map: solidThingToPlannerDay,
    });
  }

  private async deletePlannerDayNow(day: string): Promise<void> {
    await this.operations.delete(
      'plannerDay',
      day,
      this.solidRuntime.plannerDayProfile,
      day,
    );
  }

  private async savePlannerDialogStateNow(
    addPlannedTasksDialogLastShown: string | undefined,
  ): Promise<void> {
    const nextState = createSolidPlannerState(addPlannedTasksDialogLastShown);
    await this.operations.upsert({
      model: 'plannerState',
      id: SOLID_PLANNER_STATE_ID,
      value: nextState,
      resourceName: SOLID_PLANNER_STATE_RESOURCE_NAME,
      profile: this.solidRuntime.plannerStateProfile,
      createInput: plannerStateToSolidCreateInput(
        nextState,
        this.solidRuntime.plannerStateProfile,
      ),
      changes: plannerStateToSolidChanges(nextState),
      map: solidThingToPlannerState,
    });
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
