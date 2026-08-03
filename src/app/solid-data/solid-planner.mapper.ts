import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  PlannerState,
  plannerInitialState,
} from '../features/planner/store/planner.reducer';
import {
  SOLID_PRODUCTIVITY_PLANNER_CONTAINER,
  SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
  SP_PLANNER_DAY,
  SP_PLANNER_STATE,
} from './solid-productivity-vocab';
import {
  addArray,
  addLiteral,
  addOptionalLiteral,
  deleteAbsentValue,
  numberProp,
  SolidRdfPropertyMap,
  stringArrayProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export interface SolidPlannerDay {
  day: string;
  taskIds: string[];
  updated: number;
}

export interface SolidPlannerState {
  id: typeof SOLID_PLANNER_STATE_ID;
  addPlannedTasksDialogLastShown: string | undefined;
  updated: number;
}

export const SOLID_PLANNER_STATE_ID = 'super-productivity-planner-state';
export const SOLID_PLANNER_STATE_RESOURCE_NAME = 'state';

export const plannerDayToSolidCreateInput = (
  plannerDay: SolidPlannerDay,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_PLANNER_CONTAINER,
    resourceName: plannerDay.day,
  },
  title: plannerDay.day,
  facets: {
    title: plannerDay.day,
    status: 'active',
  },
  properties: plannerDayToSolidProperties(plannerDay),
});

export const plannerDayToSolidChanges = (plannerDay: SolidPlannerDay): ThingChanges => ({
  title: plannerDay.day,
  status: 'active',
  replaceProperties: plannerDayToSolidProperties(plannerDay),
});

export const plannerDayToSolidProperties = (
  plannerDay: SolidPlannerDay,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_PLANNER_DAY.day, plannerDay.day);
  addArray(properties, SP_PLANNER_DAY.taskId, plannerDay.taskIds, {
    includeEmpty: true,
  });
  addLiteral(properties, SP_PLANNER_DAY.updated, plannerDay.updated);

  return properties;
};

export const solidThingToPlannerDay = (thing: Thing): SolidPlannerDay => ({
  day: stringProp(thing, SP_PLANNER_DAY.day) ?? thing.facets.title ?? thing.uri,
  taskIds: stringArrayProp(thing, SP_PLANNER_DAY.taskId),
  updated: numberProp(thing, SP_PLANNER_DAY.updated) ?? 0,
});

export const plannerStateToSolidCreateInput = (
  plannerState: SolidPlannerState,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_PLANNER_CONTAINER,
    resourceName: SOLID_PLANNER_STATE_RESOURCE_NAME,
  },
  title: 'Super Productivity planner state',
  facets: {
    title: 'Super Productivity planner state',
    status: 'active',
  },
  properties: plannerStateToSolidProperties(plannerState),
});

export const plannerStateToSolidChanges = (
  plannerState: SolidPlannerState,
): ThingChanges => ({
  title: 'Super Productivity planner state',
  status: 'active',
  replaceProperties: plannerStateToSolidProperties(plannerState),
  deleteProperties: plannerStateToSolidDeleteProperties(plannerState),
});

export const plannerStateToSolidProperties = (
  plannerState: SolidPlannerState,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_PLANNER_STATE.id, plannerState.id);
  addOptionalLiteral(
    properties,
    SP_PLANNER_STATE.addPlannedTasksDialogLastShown,
    plannerState.addPlannedTasksDialogLastShown,
  );
  addLiteral(properties, SP_PLANNER_STATE.updated, plannerState.updated);

  return properties;
};

export const solidThingToPlannerState = (thing: Thing): SolidPlannerState => ({
  id: SOLID_PLANNER_STATE_ID,
  addPlannedTasksDialogLastShown: stringProp(
    thing,
    SP_PLANNER_STATE.addPlannedTasksDialogLastShown,
  ),
  updated: numberProp(thing, SP_PLANNER_STATE.updated) ?? 0,
});

export const solidPlannerDayQuery = {
  type: SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
} as const;

export const solidPlannerStateQuery = {
  type: SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
} as const;

export const createPlannerStateFromSolid = (
  days: readonly SolidPlannerDay[],
  state: SolidPlannerState | null,
): PlannerState => ({
  ...plannerInitialState,
  days: Object.fromEntries(days.map((day) => [day.day, day.taskIds])),
  addPlannedTasksDialogLastShown: state?.addPlannedTasksDialogLastShown,
});

export const createSolidPlannerState = (
  addPlannedTasksDialogLastShown: string | undefined,
): SolidPlannerState => ({
  id: SOLID_PLANNER_STATE_ID,
  addPlannedTasksDialogLastShown,
  updated: Date.now(),
});

const plannerStateToSolidDeleteProperties = (
  plannerState: SolidPlannerState,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(
    properties,
    SP_PLANNER_STATE.addPlannedTasksDialogLastShown,
    plannerState.addPlannedTasksDialogLastShown,
  );

  return properties;
};
