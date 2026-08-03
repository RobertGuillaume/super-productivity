import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { SP_ARCHIVED_TASK } from './solid-productivity-vocab';
import {
  archivedTaskToSolidChanges,
  archivedTaskToSolidCreateInput,
  solidThingToArchivedTask,
} from './solid-archived-task.mapper';

describe('solidArchivedTask.mapper', () => {
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Archived task',
    projectId: 'project-1',
    subTaskIds: ['sub-1'],
    tagIds: ['tag-1'],
    isDone: true,
    created: 1710000000000,
    doneOn: 1710000000100,
  };

  it('maps an archived task to Solid runtime create input', () => {
    const input = archivedTaskToSolidCreateInput(
      { task, bucket: 'young' },
      {
        name: 'Archived task',
        type: 'SuperProductivityArchivedTask',
        target: {
          containerUri: 'https://pod.example/super-productivity/archive/tasks/',
        },
      },
    );

    expect(input.title).toBe(task.title);
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/archive/tasks/',
      resourceName: 'young-task-1',
    });
    expect(input.facets?.status).toBe('archived');
    expect(input.properties?.[SP_ARCHIVED_TASK.id]).toEqual(['task-1']);
    expect(input.properties?.[SP_ARCHIVED_TASK.bucket]).toEqual(['young']);
    expect(input.properties?.[SP_ARCHIVED_TASK.subTaskId]).toEqual(['sub-1']);
  });

  it('maps archived task updates to replacement and deletion RDF changes', () => {
    const changes = archivedTaskToSolidChanges({
      task: {
        ...task,
        subTaskIds: [],
        tagIds: [],
        parentId: undefined,
      },
      bucket: 'old',
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_ARCHIVED_TASK.id]).toEqual(['task-1']);
    expect(changes.replaceProperties?.[SP_ARCHIVED_TASK.bucket]).toEqual(['old']);
    expect(changes.replaceProperties?.[SP_ARCHIVED_TASK.subTaskId]).toEqual([]);
    expect(changes.replaceProperties?.[SP_ARCHIVED_TASK.tagId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_ARCHIVED_TASK.parentId]).toEqual([]);
  });

  it('round-trips an archived task through RDF properties and JSON data', () => {
    const thing = createThing(
      {
        [SP_ARCHIVED_TASK.id]: [literal(task.id)],
        [SP_ARCHIVED_TASK.bucket]: [literal('old')],
        [SP_ARCHIVED_TASK.projectId]: [literal(task.projectId)],
        [SP_ARCHIVED_TASK.subTaskId]: task.subTaskIds.map(literal),
        [SP_ARCHIVED_TASK.tagId]: task.tagIds.map(literal),
        [SP_ARCHIVED_TASK.doneOn]: [literal(task.doneOn!)],
        [SP_ARCHIVED_TASK.taskData]: [literal(JSON.stringify(task))],
      },
      {
        title: task.title,
        status: 'archived',
      },
    );

    const mapped = solidThingToArchivedTask(thing);

    expect(mapped.bucket).toBe('old');
    expect(mapped.task.id).toBe(task.id);
    expect(mapped.task.title).toBe(task.title);
    expect(mapped.task.projectId).toBe(task.projectId);
    expect(mapped.task.subTaskIds).toEqual(task.subTaskIds);
    expect(mapped.task.tagIds).toEqual(task.tagIds);
    expect(mapped.task.doneOn).toBe(task.doneOn);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  facets: Thing['facets'],
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/archive/tasks/old-task-1#it',
    content: {
      uri: 'https://pod.example/super-productivity/archive/tasks/old-task-1',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/archive/tasks/old-task-1',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityArchivedTask'],
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
