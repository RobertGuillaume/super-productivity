import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { Note } from '../features/note/note.model';
import { SP_NOTE } from './solid-productivity-vocab';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  activateSolidMutationTestBinding,
  installRuntimeWritePlanBridge,
  updateThingPlan,
} from './testing/solid-runtime-write-plan.fixture';

describe('SolidNoteRepository', () => {
  const note: Note = {
    id: 'note-1',
    projectId: 'project-1',
    isPinnedToToday: false,
    content: 'Note through a write plan',
    created: 1710000000000,
    modified: 1710000000100,
  };

  let things: {
    query: jasmine.Spy;
    create: jasmine.Spy;
    delete: jasmine.Spy;
    subscribe: jasmine.Spy;
  };
  let writes: {
    planUpdate: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);
    installRuntimeWritePlanBridge(writes, things);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          notes: 'https://pod.example/super-productivity/notes/',
        },
        types: {
          SuperProductivityNote: {
            name: 'Note',
            type: 'SuperProductivityNote',
            target: {
              containerUri: 'https://pod.example/super-productivity/notes/',
            },
          },
        },
      }),
      noteProfile: {
        name: 'Note',
        type: 'SuperProductivityNote',
        target: {
          containerUri: 'https://pod.example/super-productivity/notes/',
        },
      },
      client: {
        things,
        writes,
      },
    } as unknown as SolidRuntimeService;

    TestBed.configureTestingModule({
      providers: [{ provide: SolidRuntimeService, useValue: solidRuntime }],
    });
  });

  beforeEach(() => activateSolidMutationTestBinding());

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('commits existing note updates through the runtime write plan API', async () => {
    const existingThing = createThing(note.content);
    const updatedThing = createThing('Updated note content');
    const plan = updateThingPlan(existingThing.uri, {});

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.resolveTo(plan);
    writes.commit.withArgs(plan).and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const repository = TestBed.inject(SolidNoteRepository);
    await repository.loadNotes();
    const saved = await repository.saveNote(note);

    expect(things.create).not.toHaveBeenCalled();
    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        fields: jasmine.objectContaining({
          id: note.id,
          content: note.content,
          projectId: note.projectId,
        }),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.content).toBe('Updated note content');
  });
});

const createThing = (content: string): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_NOTE.id]: [literal('note-1')],
    [SP_NOTE.projectId]: [literal('project-1')],
    [SP_NOTE.isPinnedToToday]: [literal(false)],
    [SP_NOTE.content]: [literal(content)],
    [SP_NOTE.created]: [literal(1710000000000)],
    [SP_NOTE.modified]: [literal(1710000000100)],
  };
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
    facets: {
      title: content,
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
