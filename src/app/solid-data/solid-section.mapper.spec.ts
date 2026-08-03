import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { Section } from '../features/section/section.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { SP_SECTION } from './solid-productivity-vocab';
import {
  sectionToSolidChanges,
  sectionToSolidCreateInput,
  solidThingToSection,
} from './solid-section.mapper';

describe('solidSection.mapper', () => {
  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Solid section',
    isExpanded: true,
    taskIds: ['task-1', 'task-2'],
  };

  it('maps a section to Solid runtime create input', () => {
    const input = sectionToSolidCreateInput(section, {
      name: 'Section',
      type: 'SuperProductivitySection',
      target: {
        containerUri: 'https://pod.example/super-productivity/sections/',
      },
    });

    expect(input.title).toBe('Solid section');
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/sections/',
      resourceName: 'section-1',
    });
    expect(input.properties?.[SP_SECTION.id]).toEqual(['section-1']);
    expect(input.properties?.[SP_SECTION.contextId]).toEqual(['project-1']);
    expect(input.properties?.[SP_SECTION.taskId]).toEqual(['task-1', 'task-2']);
  });

  it('maps section updates to replacement and deletion RDF changes', () => {
    const changes = sectionToSolidChanges({
      ...section,
      isExpanded: undefined,
      taskIds: [],
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_SECTION.id]).toEqual(['section-1']);
    expect(changes.replaceProperties?.[SP_SECTION.taskId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_SECTION.isExpanded]).toEqual([]);
  });

  it('round-trips core section fields through RDF properties', () => {
    const thing = createThing({
      [SP_SECTION.id]: [literal(section.id)],
      [SP_SECTION.contextId]: [literal(section.contextId)],
      [SP_SECTION.contextType]: [literal(section.contextType)],
      [SP_SECTION.title]: [literal(section.title)],
      [SP_SECTION.isExpanded]: [literal(true)],
      [SP_SECTION.taskId]: [literal('task-1'), literal('task-2')],
    });

    expect(solidThingToSection(thing)).toEqual(section);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/sections/section-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/sections/section-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/sections/section-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivitySection'],
    facets: {
      title: 'Solid section',
      status: 'open',
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
