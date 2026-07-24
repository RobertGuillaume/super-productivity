import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { SP_PROJECT } from './solid-productivity-vocab';
import {
  projectToSolidChanges,
  projectToSolidCreateInput,
  solidThingToProject,
} from './solid-project.mapper';

describe('solidProject.mapper', () => {
  const project: Project = {
    ...DEFAULT_PROJECT,
    id: 'project-1',
    title: 'Solid Project',
    taskIds: ['task-1', 'task-2'],
    backlogTaskIds: ['task-3'],
    noteIds: ['note-1'],
    isArchived: true,
    isDone: true,
    doneOn: 1710000000000,
    icon: 'work',
  };

  it('maps a project to Solid runtime create input', () => {
    const input = projectToSolidCreateInput(project, {
      name: 'Project',
      type: 'SuperProductivityProject',
      target: {
        containerUri: 'https://pod.example/super-productivity/projects/',
      },
    });

    expect(input.title).toBe(project.title);
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/projects/',
      resourceName: 'project-1',
    });
    expect(input.facets?.status).toBe('archived');
    expect(input.properties?.[SP_PROJECT.id]).toEqual(['project-1']);
    expect(input.properties?.[SP_PROJECT.taskId]).toEqual(['task-1', 'task-2']);
  });

  it('maps project updates to replacement and deletion RDF changes', () => {
    const changes = projectToSolidChanges({
      ...project,
      taskIds: [],
      backlogTaskIds: [],
      noteIds: [],
      doneOn: null,
      icon: null,
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_PROJECT.id]).toEqual(['project-1']);
    expect(changes.replaceProperties?.[SP_PROJECT.taskId]).toEqual([]);
    expect(changes.replaceProperties?.[SP_PROJECT.backlogTaskId]).toEqual([]);
    expect(changes.replaceProperties?.[SP_PROJECT.noteId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_PROJECT.doneOn]).toEqual([]);
    expect(changes.deleteProperties?.[SP_PROJECT.icon]).toEqual([]);
  });

  it('round-trips core project fields through RDF properties', () => {
    const thing = createThing(
      {
        [SP_PROJECT.id]: [literal(project.id)],
        [SP_PROJECT.title]: [literal(project.title)],
        [SP_PROJECT.isArchived]: [literal(true)],
        [SP_PROJECT.isDone]: [literal(true)],
        [SP_PROJECT.doneOn]: [literal(1710000000000)],
        [SP_PROJECT.isHiddenFromMenu]: [literal(false)],
        [SP_PROJECT.isEnableBacklog]: [literal(false)],
        [SP_PROJECT.taskId]: project.taskIds.map(literal),
        [SP_PROJECT.backlogTaskId]: project.backlogTaskIds.map(literal),
        [SP_PROJECT.noteId]: project.noteIds.map(literal),
        [SP_PROJECT.theme]: [literal(JSON.stringify(project.theme))],
        [SP_PROJECT.advancedCfg]: [literal(JSON.stringify(project.advancedCfg))],
        [SP_PROJECT.icon]: [literal('work')],
      },
      {
        title: project.title,
        status: 'archived',
      },
    );

    const mapped = solidThingToProject(thing);

    expect(mapped.id).toBe(project.id);
    expect(mapped.title).toBe(project.title);
    expect(mapped.isArchived).toBe(true);
    expect(mapped.isDone).toBe(true);
    expect(mapped.doneOn).toBe(project.doneOn);
    expect(mapped.taskIds).toEqual(project.taskIds);
    expect(mapped.backlogTaskIds).toEqual(project.backlogTaskIds);
    expect(mapped.noteIds).toEqual(project.noteIds);
    expect(mapped.theme).toEqual(project.theme);
    expect(mapped.advancedCfg).toEqual(project.advancedCfg);
    expect(mapped.icon).toBe(project.icon);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  facets: Thing['facets'],
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/projects/project-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/projects/project-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/projects/project-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityProject'],
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
