import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SP_TASK } from './solid-productivity-vocab';
import {
  solidThingToTask,
  taskToSolidChanges,
  taskToSolidCreateInput,
} from './solid-task.mapper';

describe('solidTask.mapper', () => {
  const today = '2026-07-24';
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Write Solid mapper',
    projectId: 'project-1',
    subTaskIds: ['sub-1'],
    tagIds: ['tag-1', 'tag-2'],
    isDone: true,
    created: 1710000000000,
    modified: 1710000000100,
    timeSpent: 1200,
    timeEstimate: 2400,
    timeSpentOnDay: {
      [today]: 1200,
    },
    attachments: [],
  };

  it('maps a task to Solid runtime create input', () => {
    const input = taskToSolidCreateInput(task, {
      name: 'Task',
      type: 'SuperProductivityTask',
      target: {
        containerUri: 'https://pod.example/super-productivity/tasks/',
      },
    });

    expect(input.title).toBe(task.title);
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/tasks/',
      resourceName: 'task-1',
    });
    expect(input.facets?.status).toBe('done');
    expect(input.properties?.[SP_TASK.id]).toEqual(['task-1']);
    expect(input.properties?.[SP_TASK.tagId]).toEqual(['tag-1', 'tag-2']);
  });

  it('maps task updates to replacement and deletion RDF changes', () => {
    const changes = taskToSolidChanges({
      ...task,
      subTaskIds: [],
      tagIds: [],
      dueDay: undefined,
      reminderId: null,
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_TASK.id]).toEqual(['task-1']);
    expect(changes.replaceProperties?.[SP_TASK.subTaskId]).toEqual([]);
    expect(changes.replaceProperties?.[SP_TASK.tagId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TASK.dueDay]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TASK.reminderId]).toEqual([]);
  });

  it('round-trips the core task fields through RDF properties', () => {
    const thing = createThing(
      {
        [SP_TASK.id]: [literal(task.id)],
        [SP_TASK.projectId]: [literal(task.projectId)],
        [SP_TASK.isDone]: [literal(task.isDone)],
        [SP_TASK.created]: [literal(task.created)],
        [SP_TASK.timeSpent]: [literal(task.timeSpent)],
        [SP_TASK.timeEstimate]: [literal(task.timeEstimate)],
        [SP_TASK.subTaskId]: task.subTaskIds.map(literal),
        [SP_TASK.tagId]: task.tagIds.map(literal),
        [SP_TASK.timeSpentOnDay]: [literal(JSON.stringify(task.timeSpentOnDay))],
        [SP_TASK.attachments]: [literal(JSON.stringify(task.attachments))],
      },
      {
        title: task.title,
        status: 'done',
      },
    );

    const mapped = solidThingToTask(thing);

    expect(mapped.id).toBe(task.id);
    expect(mapped.title).toBe(task.title);
    expect(mapped.projectId).toBe(task.projectId);
    expect(mapped.isDone).toBe(true);
    expect(mapped.subTaskIds).toEqual(task.subTaskIds);
    expect(mapped.tagIds).toEqual(task.tagIds);
    expect(mapped.timeSpentOnDay).toEqual(task.timeSpentOnDay);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  facets: Thing['facets'],
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/tasks/task-1#it',
    content: {
      uri: 'https://pod.example/super-productivity/tasks/task-1',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/tasks/task-1',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTask'],
    facets,
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
