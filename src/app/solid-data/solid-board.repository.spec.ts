import type {
  RdfLiteralValue,
  RdfValue,
  RuntimeWritePlan,
  Thing,
  ThingView,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import {
  BoardCfg,
  BoardPanelCfgScheduledState,
  BoardPanelCfgTaskDoneState,
} from '../features/boards/boards.model';
import { RDF_JSON_DATATYPE, SP_BOARD } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidBoardRepository } from './solid-board.repository';

describe('SolidBoardRepository', () => {
  const board: BoardCfg = {
    id: 'board-1',
    title: 'Solid board',
    cols: 2,
    panels: [
      {
        id: 'panel-1',
        title: 'Panel',
        taskIds: ['task-1'],
        includedTagIds: [],
        excludedTagIds: [],
        taskDoneState: BoardPanelCfgTaskDoneState.All,
        scheduledState: BoardPanelCfgScheduledState.All,
        isParentTasksOnly: false,
        projectIds: ['project-1'],
      },
    ],
  };

  let discovery: {
    start: jasmine.Spy;
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
    discovery = jasmine.createSpyObj('discovery', ['start']);
    things = jasmine.createSpyObj('things', ['query', 'create', 'delete', 'subscribe']);
    writes = jasmine.createSpyObj('writes', ['planUpdate', 'commit']);

    const solidRuntime = {
      ensureLayout: () => ({
        containers: {
          boards: 'https://pod.example/super-productivity/boards/',
        },
        types: {
          SuperProductivityBoard: {
            name: 'Board',
            type: 'SuperProductivityBoard',
            target: {
              containerUri: 'https://pod.example/super-productivity/boards/',
            },
          },
        },
      }),
      boardProfile: {
        name: 'Board',
        type: 'SuperProductivityBoard',
        target: {
          containerUri: 'https://pod.example/super-productivity/boards/',
        },
      },
      client: {
        discovery,
        things,
        writes,
      },
    } as unknown as SolidRuntimeService;

    TestBed.configureTestingModule({
      providers: [{ provide: SolidRuntimeService, useValue: solidRuntime }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads boards from the configured Solid container in order', async () => {
    const first = createThing({ ...board, id: 'board-1' }, 2);
    const second = createThing({ ...board, id: 'board-2' }, 1);
    things.query.and.resolveTo({ things: [first, second] });

    const boards = await TestBed.inject(SolidBoardRepository).loadBoards();

    expect(discovery.start).toHaveBeenCalledOnceWith({
      entrypoints: ['https://pod.example/super-productivity/boards/'],
      mode: 'balanced',
    });
    expect(things.query).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'SuperProductivityBoard',
      }),
      jasmine.objectContaining({
        scope: {
          kind: 'container',
          uri: 'https://pod.example/super-productivity/boards/',
        },
      }),
    );
    expect(boards.map((loadedBoard) => loadedBoard.id)).toEqual(['board-2', 'board-1']);
  });

  it('creates deterministic board resources when none exists', async () => {
    things.query.and.resolveTo({ things: [] });
    things.create.and.resolveTo(createThing(board, 3));

    await TestBed.inject(SolidBoardRepository).saveBoard(board, 3);

    expect(things.create).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        target: {
          containerUri: 'https://pod.example/super-productivity/boards/',
          resourceName: 'board-1',
        },
        properties: jasmine.objectContaining({
          [SP_BOARD.id]: ['board-1'],
          [SP_BOARD.title]: ['Solid board'],
          [SP_BOARD.order]: [3],
        }),
      }),
    );
  });

  it('commits existing board updates through the runtime write plan API', async () => {
    const existingThing = createThing(board, 0);
    const updatedThing = createThing(
      {
        ...board,
        title: 'Updated board',
      },
      0,
    );
    const plan = {
      version: 1,
      id: 'write-plan-1',
      kind: 'thing.update',
      request: {
        kind: 'thing.update',
        uri: existingThing.uri,
        changes: {},
      },
      operations: [],
      affectedResources: [],
      preconditions: [],
      diagnostics: [],
    } as RuntimeWritePlan;

    things.query.and.resolveTo({ things: [existingThing] });
    writes.planUpdate.and.returnValue(plan);
    writes.commit.and.resolveTo({
      planId: plan.id,
      kind: 'thing.update',
      result: updatedThing,
    });

    const saved = await TestBed.inject(SolidBoardRepository).saveBoard(board);

    expect(writes.planUpdate).toHaveBeenCalledOnceWith(
      existingThing.uri,
      jasmine.objectContaining({
        replaceProperties: jasmine.any(Object),
      }),
    );
    expect(writes.commit).toHaveBeenCalledOnceWith(plan);
    expect(saved.title).toBe('Updated board');
  });

  it('deletes existing board resources through the runtime delete API', async () => {
    const existingThing = createThing(board, 0);
    things.query.and.resolveTo({ things: [existingThing] });
    things.delete.and.resolveTo();

    await TestBed.inject(SolidBoardRepository).deleteBoard(board.id);

    expect(things.delete).toHaveBeenCalledOnceWith(existingThing.uri);
  });
});

const createThing = (board: BoardCfg, order: number): Thing => {
  const properties: Readonly<Record<string, readonly RdfValue[]>> = {
    [SP_BOARD.id]: [literal(board.id)],
    [SP_BOARD.title]: [literal(board.title)],
    [SP_BOARD.cols]: [literal(board.cols)],
    [SP_BOARD.order]: [literal(order)],
    [SP_BOARD.panels]: [jsonLiteral(board.panels)],
    [SP_BOARD.boardData]: [jsonLiteral(board)],
  };
  const thing: Thing = {
    uri: `https://pod.example/super-productivity/boards/${board.id}.ttl#it`,
    content: {
      uri: `https://pod.example/super-productivity/boards/${board.id}.ttl`,
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: `https://pod.example/super-productivity/boards/${board.id}.ttl`,
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityBoard'],
    facets: {
      title: board.title,
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

const jsonLiteral = (value: unknown): RdfValue => ({
  kind: 'literal',
  value: JSON.stringify(value),
  datatype: RDF_JSON_DATATYPE,
});
