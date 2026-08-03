import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { SP_APP_STATE } from './solid-productivity-vocab';
import {
  appStateToSolidChanges,
  appStateToSolidCreateInput,
  SOLID_APP_STATE_ID,
  SOLID_APP_STATE_RESOURCE_NAME,
  SolidAppState,
  solidThingToAppState,
} from './solid-app-state.mapper';

describe('solidAppState.mapper', () => {
  const appState: SolidAppState = {
    id: SOLID_APP_STATE_ID,
    projectOrder: ['project-2', 'project-1'],
    tagOrder: ['TODAY', 'tag-2', 'tag-1'],
    noteTodayOrder: ['note-2', 'note-1'],
    sectionOrder: ['section-2', 'section-1'],
    updated: 1710000000000,
  };

  it('maps app state to deterministic Solid runtime create input', () => {
    const input = appStateToSolidCreateInput(appState, {
      name: 'App state',
      type: 'SuperProductivityAppState',
      target: {
        containerUri: 'https://pod.example/super-productivity/app/',
      },
    });

    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/app/',
      resourceName: SOLID_APP_STATE_RESOURCE_NAME,
    });
    expect(input.properties?.[SP_APP_STATE.id]).toEqual([SOLID_APP_STATE_ID]);
    expect(input.properties?.[SP_APP_STATE.projectOrder]).toEqual([
      'project-2',
      'project-1',
    ]);
    expect(input.properties?.[SP_APP_STATE.noteTodayOrder]).toEqual(['note-2', 'note-1']);
    expect(input.properties?.[SP_APP_STATE.sectionOrder]).toEqual([
      'section-2',
      'section-1',
    ]);
  });

  it('maps app state updates to replacement RDF changes', () => {
    const changes = appStateToSolidChanges(appState);

    expect(changes.properties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_APP_STATE.id]).toEqual([SOLID_APP_STATE_ID]);
    expect(changes.replaceProperties?.[SP_APP_STATE.projectOrder]).toEqual([
      'project-2',
      'project-1',
    ]);
    expect(changes.replaceProperties?.[SP_APP_STATE.tagOrder]).toEqual([
      'TODAY',
      'tag-2',
      'tag-1',
    ]);
    expect(changes.replaceProperties?.[SP_APP_STATE.sectionOrder]).toEqual([
      'section-2',
      'section-1',
    ]);
  });

  it('round-trips order fields through RDF properties', () => {
    const thing = createThing({
      [SP_APP_STATE.id]: [literal(SOLID_APP_STATE_ID)],
      [SP_APP_STATE.projectOrder]: [literal('project-2'), literal('project-1')],
      [SP_APP_STATE.tagOrder]: [literal('TODAY'), literal('tag-2'), literal('tag-1')],
      [SP_APP_STATE.noteTodayOrder]: [literal('note-2'), literal('note-1')],
      [SP_APP_STATE.sectionOrder]: [literal('section-2'), literal('section-1')],
      [SP_APP_STATE.updated]: [literal(1710000000000)],
    });

    expect(solidThingToAppState(thing)).toEqual(appState);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/app/state.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/app/state.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/app/state.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityAppState'],
    facets: {
      title: 'Super Productivity app state',
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
