import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { BoardCfg } from '../features/boards/boards.model';
import { SP_BOARD } from './solid-productivity-vocab';
import {
  boardToSolidChanges,
  boardToSolidCreateInput,
  solidBoardQuery,
  solidThingToBoard,
  solidThingToBoardRecord,
} from './solid-board.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidBoardContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidBoardRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadBoards(): Promise<SolidRepositoryRead<BoardCfg[]>> {
    const boardContainerScope = this.boardContainerScope();

    const result = await this.solidRuntime.client.things.query(solidBoardQuery, {
      scope: boardContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(boardContainerScope.uri, result.things)
        .map((thing) => {
          const record = solidThingToBoardRecord(thing);
          return this.operations.remember('board', record.board.id, thing, record);
        })
        .sort((a, b) => a.order - b.order)
        .map((record) => record.board),
      result.metadata,
    );
  }

  saveBoard(board: BoardCfg, order = 0): Promise<BoardCfg> {
    return this.mutationCoordinator.run(solidMutationKey('board', board.id), () =>
      this.saveBoardNow(board, order),
    );
  }

  deleteBoard(boardId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('board', boardId), () =>
      this.deleteBoardNow(boardId),
    );
  }

  private async saveBoardNow(board: BoardCfg, order: number): Promise<BoardCfg> {
    return this.operations.upsert({
      model: 'board',
      id: board.id,
      value: board,
      resourceName: board.id,
      profile: this.solidRuntime.boardProfile,
      createInput: boardToSolidCreateInput(board, this.solidRuntime.boardProfile, order),
      changes: boardToSolidChanges(board, order),
      map: solidThingToBoard,
    });
  }

  private async deleteBoardNow(boardId: string): Promise<void> {
    await this.operations.delete(
      'board',
      boardId,
      this.solidRuntime.boardProfile,
      boardId,
    );
  }

  subscribeBoards(listener: (boards: BoardCfg[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidBoardQuery,
      (result) =>
        listener(
          result.things
            .map(solidThingToBoardRecord)
            .sort((a, b) => a.order - b.order)
            .map((record) => record.board),
        ),
      {
        emitInitial: true,
      },
    );
  }

  private async findBoardThing(boardId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidBoardQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_BOARD.id,
            value: boardId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.boardContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private boardContainerScope(): SolidBoardContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.boards,
    };
  }
}
