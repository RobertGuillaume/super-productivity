import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import {
  createPlannerStateFromSolid,
  plannerDayToSolidChanges,
  plannerDayToSolidCreateInput,
  plannerStateToSolidChanges,
  plannerStateToSolidCreateInput,
  SOLID_PLANNER_STATE_ID,
  solidThingToPlannerDay,
  solidThingToPlannerState,
} from './solid-planner.mapper';
import { SP_PLANNER_DAY, SP_PLANNER_STATE } from './solid-productivity-vocab';

describe('solidPlanner.mapper', () => {
  it('maps planner days to deterministic Solid resources', () => {
    const input = plannerDayToSolidCreateInput(
      {
        day: '2026-08-04',
        taskIds: ['task-1', 'task-2'],
        updated: 1710000000000,
      },
      {
        name: 'Planner day',
        type: 'SuperProductivityPlannerDay',
        target: {
          containerUri: 'https://pod.example/super-productivity/planner/',
        },
      },
    );

    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/planner/',
      resourceName: '2026-08-04',
    });
    expect(input.properties?.[SP_PLANNER_DAY.day]).toEqual(['2026-08-04']);
    expect(input.properties?.[SP_PLANNER_DAY.taskId]).toEqual(['task-1', 'task-2']);
  });

  it('maps planner day updates with replacement semantics', () => {
    const changes = plannerDayToSolidChanges({
      day: '2026-08-04',
      taskIds: [],
      updated: 1710000000000,
    });

    expect(changes.replaceProperties?.[SP_PLANNER_DAY.taskId]).toEqual([]);
  });

  it('maps planner singleton state to deterministic Solid resources', () => {
    const input = plannerStateToSolidCreateInput(
      {
        id: SOLID_PLANNER_STATE_ID,
        addPlannedTasksDialogLastShown: '2026-08-04',
        updated: 1710000000000,
      },
      {
        name: 'Planner state',
        type: 'SuperProductivityPlannerState',
        target: {
          containerUri: 'https://pod.example/super-productivity/planner/',
        },
      },
    );

    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/planner/',
      resourceName: 'state',
    });
    expect(input.properties?.[SP_PLANNER_STATE.id]).toEqual([SOLID_PLANNER_STATE_ID]);
  });

  it('maps planner singleton state updates with delete semantics', () => {
    const changes = plannerStateToSolidChanges({
      id: SOLID_PLANNER_STATE_ID,
      addPlannedTasksDialogLastShown: undefined,
      updated: 1710000000000,
    });

    expect(
      changes.deleteProperties?.[SP_PLANNER_STATE.addPlannedTasksDialogLastShown],
    ).toEqual([]);
  });

  it('hydrates planner state from Solid day and singleton resources', () => {
    const day = solidThingToPlannerDay(
      createThing(
        {
          [SP_PLANNER_DAY.day]: [literal('2026-08-04')],
          [SP_PLANNER_DAY.taskId]: [literal('task-1')],
          [SP_PLANNER_DAY.updated]: [literal(1710000000000)],
        },
        'SuperProductivityPlannerDay',
        '2026-08-04',
      ),
    );
    const state = solidThingToPlannerState(
      createThing(
        {
          [SP_PLANNER_STATE.id]: [literal(SOLID_PLANNER_STATE_ID)],
          [SP_PLANNER_STATE.addPlannedTasksDialogLastShown]: [literal('2026-08-04')],
          [SP_PLANNER_STATE.updated]: [literal(1710000000100)],
        },
        'SuperProductivityPlannerState',
        'Super Productivity planner state',
      ),
    );

    expect(createPlannerStateFromSolid([day], state)).toEqual({
      days: {
        ['2026-08-04']: ['task-1'],
      },
      addPlannedTasksDialogLastShown: '2026-08-04',
    });
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  type: string,
  title: string,
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/planner/resource#it',
    content: {
      uri: 'https://pod.example/super-productivity/planner/resource',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/planner/resource',
      kind: 'runtime-managed',
    },
    types: [type],
    facets: {
      title,
      status: 'active',
    },
    properties,
    links: {},
    known: {},
    freshness: {
      source: 'pod',
      loadedAt: new Date(0),
    },
    property: (predicateUri: string) => properties[predicateUri] ?? [],
    objects: () => [],
    as: <View>(view: ThingView<View>) => view.read(thing),
  };

  return thing;
};

const literal = (value: RdfLiteralValue['value']): RdfValue => ({
  kind: 'literal',
  value,
});
