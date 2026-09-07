import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import {
  BoardCfg,
  BoardPanelCfgScheduledState,
  BoardPanelCfgTaskDoneState,
} from '../features/boards/boards.model';
import {
  addBoard,
  removeBoard,
  sortBoards,
  updateBoard,
  updatePanelCfgTaskIds,
} from '../features/boards/store/boards.actions';
import { BoardsState } from '../features/boards/store/boards.reducer';
import { selectBoardsState } from '../features/boards/store/boards.selectors';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidBoardPersistenceEffects } from './solid-board-persistence.effects';
import { SolidBoardRepository } from './solid-board.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';

describe('SolidBoardPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidBoardRepository: jasmine.SpyObj<SolidBoardRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const board: BoardCfg = {
    id: 'board-1',
    title: 'State board',
    cols: 1,
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
  const secondBoard: BoardCfg = {
    ...board,
    id: 'board-2',
    title: 'Second board',
    panels: [
      {
        ...board.panels[0],
        id: 'panel-2',
      },
    ],
  };
  const boardsState: BoardsState = {
    boardCfgs: [board, secondBoard],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidBoardRepository = jasmine.createSpyObj<SolidBoardRepository>(
      'SolidBoardRepository',
      ['saveBoard', 'deleteBoard'],
    );
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidBoardPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidBoardRepository, useValue: solidBoardRepository },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists added boards from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidBoardRepository.saveBoard.and.resolveTo(board);
    store.select.and.callFake((selector) =>
      selector === selectBoardsState ? of(boardsState) : of([]),
    );
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardSave$.subscribe();

    actions$.next(
      addBoard({
        board: {
          ...board,
          title: 'payload should not be used',
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectBoardsState],
    ]);
    expect(solidBoardRepository.saveBoard).toHaveBeenCalledOnceWith(board, 0);
    subscription.unsubscribe();
  });

  it('persists updated boards by id from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidBoardRepository.saveBoard.and.resolveTo(secondBoard);
    store.select.and.returnValue(of(boardsState));
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardSave$.subscribe();

    actions$.next(
      updateBoard({
        id: 'board-2',
        updates: {
          title: 'payload should not be used',
        },
      }),
    );
    await Promise.resolve();

    expect(solidBoardRepository.saveBoard).toHaveBeenCalledOnceWith(secondBoard, 1);
    subscription.unsubscribe();
  });

  it('persists board order changes with post-reducer order indexes', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidBoardRepository.saveBoard.and.resolveTo(board);
    store.select.and.returnValue(
      of({
        boardCfgs: [secondBoard, board],
      } satisfies BoardsState),
    );
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardSave$.subscribe();

    actions$.next(sortBoards({ ids: ['board-2', 'board-1'] }));
    await Promise.resolve();

    expect(solidBoardRepository.saveBoard.calls.allArgs()).toEqual([
      [secondBoard, 0],
      [board, 1],
    ]);
    subscription.unsubscribe();
  });

  it('persists the board containing changed panel task ids', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidBoardRepository.saveBoard.and.resolveTo(secondBoard);
    store.select.and.returnValue(of(boardsState));
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardSave$.subscribe();

    actions$.next(
      updatePanelCfgTaskIds({
        panelId: 'panel-2',
        taskIds: ['task-2'],
      }),
    );
    await Promise.resolve();

    expect(solidBoardRepository.saveBoard).toHaveBeenCalledOnceWith(secondBoard, 1);
    subscription.unsubscribe();
  });

  it('persists board deletes', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidBoardRepository.deleteBoard.and.resolveTo();
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardDelete$.subscribe();

    actions$.next(removeBoard({ id: 'board-1' }));
    await Promise.resolve();

    expect(solidBoardRepository.deleteBoard).toHaveBeenCalledOnceWith('board-1');
    subscription.unsubscribe();
  });

  it('ignores remote board actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidBoardPersistenceEffects);
    const subscription = effects.persistBoardSave$.subscribe();

    actions$.next({
      ...sortBoards({ ids: ['board-2', 'board-1'] }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidBoardRepository.saveBoard).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
