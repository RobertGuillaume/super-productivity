import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { SP_TAG } from './solid-productivity-vocab';
import {
  solidThingToTag,
  tagToSolidChanges,
  tagToSolidCreateInput,
} from './solid-tag.mapper';

describe('solidTag.mapper', () => {
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Solid Tag',
    color: '#29a1aa',
    created: 1710000000000,
    updated: 1710000000100,
    taskIds: ['task-1', 'task-2'],
    icon: 'label',
  };

  it('maps a tag to Solid runtime create input', () => {
    const input = tagToSolidCreateInput(tag, {
      name: 'Tag',
      type: 'SuperProductivityTag',
      target: {
        containerUri: 'https://pod.example/super-productivity/tags/',
      },
    });

    expect(input.title).toBe(tag.title);
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/tags/',
      resourceName: 'tag-1',
    });
    expect(input.facets?.status).toBe('open');
    expect(input.properties?.[SP_TAG.id]).toEqual(['tag-1']);
    expect(input.properties?.[SP_TAG.taskId]).toEqual(['task-1', 'task-2']);
  });

  it('maps tag updates to replacement and deletion RDF changes', () => {
    const changes = tagToSolidChanges({
      ...tag,
      taskIds: [],
      color: null,
      icon: null,
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_TAG.id]).toEqual(['tag-1']);
    expect(changes.replaceProperties?.[SP_TAG.taskId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TAG.color]).toEqual([]);
    expect(changes.deleteProperties?.[SP_TAG.icon]).toEqual([]);
  });

  it('round-trips core tag fields through RDF properties', () => {
    const thing = createThing(
      {
        [SP_TAG.id]: [literal(tag.id)],
        [SP_TAG.title]: [literal(tag.title)],
        [SP_TAG.color]: [literal('#29a1aa')],
        [SP_TAG.created]: [literal(tag.created)],
        [SP_TAG.updated]: [literal(1710000000100)],
        [SP_TAG.taskId]: tag.taskIds.map(literal),
        [SP_TAG.theme]: [literal(JSON.stringify(tag.theme))],
        [SP_TAG.advancedCfg]: [literal(JSON.stringify(tag.advancedCfg))],
        [SP_TAG.icon]: [literal('label')],
      },
      {
        title: tag.title,
        status: 'open',
      },
    );

    const mapped = solidThingToTag(thing);

    expect(mapped.id).toBe(tag.id);
    expect(mapped.title).toBe(tag.title);
    expect(mapped.color).toBe(tag.color);
    expect(mapped.created).toBe(tag.created);
    expect(mapped.updated).toBe(tag.updated);
    expect(mapped.taskIds).toEqual(tag.taskIds);
    expect(mapped.theme).toEqual(tag.theme);
    expect(mapped.advancedCfg).toEqual(tag.advancedCfg);
    expect(mapped.icon).toBe(tag.icon);
  });

  it('preserves a legacy Thing URI when the application id is absent', () => {
    const uri = 'https://pod.example/super-productivity/tags/TODAY.ttl#it';
    const thing = createThing(
      {
        [SP_TAG.title]: [literal('Today')],
      },
      { title: 'Today', status: 'open' },
      uri,
    );

    expect(solidThingToTag(thing).id).toBe(uri);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  facets: Thing['facets'],
  uri = 'https://pod.example/super-productivity/tags/tag-1.ttl#it',
): Thing => {
  const sourceUri = uri.split('#')[0];
  const thing: Thing = {
    uri,
    content: {
      uri: sourceUri,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: sourceUri,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityTag'],
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
