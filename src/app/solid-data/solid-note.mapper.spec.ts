import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { Note } from '../features/note/note.model';
import { SP_NOTE } from './solid-productivity-vocab';
import {
  noteToSolidChanges,
  noteToSolidCreateInput,
  solidThingToNote,
} from './solid-note.mapper';

describe('solidNote.mapper', () => {
  const note: Note = {
    id: 'note-1',
    projectId: 'project-1',
    isPinnedToToday: true,
    content: 'Solid note\nwith details',
    imgUrl: 'https://example.com/image.png',
    isLock: true,
    backgroundColor: '#ffffff',
    created: 1710000000000,
    modified: 1710000000100,
  };

  it('maps a note to Solid runtime create input', () => {
    const input = noteToSolidCreateInput(note, {
      name: 'Note',
      type: 'SuperProductivityNote',
      target: {
        containerUri: 'https://pod.example/super-productivity/notes/',
      },
    });

    expect(input.title).toBe('Solid note');
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/notes/',
      resourceName: 'note-1',
    });
    expect(input.facets?.status).toBe('pinned');
    expect(input.properties?.[SP_NOTE.id]).toEqual(['note-1']);
    expect(input.properties?.[SP_NOTE.content]).toEqual([note.content]);
  });

  it('maps note updates to replacement and deletion RDF changes', () => {
    const changes = noteToSolidChanges({
      ...note,
      projectId: null,
      imgUrl: undefined,
      isLock: undefined,
      backgroundColor: undefined,
    });

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_NOTE.id]).toEqual(['note-1']);
    expect(changes.replaceProperties?.[SP_NOTE.content]).toEqual([note.content]);
    expect(changes.deleteProperties?.[SP_NOTE.projectId]).toEqual([]);
    expect(changes.deleteProperties?.[SP_NOTE.imgUrl]).toEqual([]);
    expect(changes.deleteProperties?.[SP_NOTE.isLock]).toEqual([]);
    expect(changes.deleteProperties?.[SP_NOTE.backgroundColor]).toEqual([]);
  });

  it('round-trips core note fields through RDF properties', () => {
    const thing = createThing(
      {
        [SP_NOTE.id]: [literal(note.id)],
        [SP_NOTE.projectId]: [literal('project-1')],
        [SP_NOTE.isPinnedToToday]: [literal(true)],
        [SP_NOTE.content]: [literal(note.content)],
        [SP_NOTE.imgUrl]: [literal('https://example.com/image.png')],
        [SP_NOTE.isLock]: [literal(true)],
        [SP_NOTE.backgroundColor]: [literal('#ffffff')],
        [SP_NOTE.created]: [literal(note.created)],
        [SP_NOTE.modified]: [literal(note.modified)],
      },
      {
        title: 'Solid note',
        status: 'pinned',
      },
    );

    const mapped = solidThingToNote(thing);

    expect(mapped).toEqual(note);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
  facets: Thing['facets'],
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/notes/note-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/notes/note-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/notes/note-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityNote'],
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
