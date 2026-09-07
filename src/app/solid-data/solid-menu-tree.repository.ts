import { inject, Injectable } from '@angular/core';
import type {
  RuntimeScope,
  Thing,
  ThingQueryResult,
  Unsubscribe,
} from '@solid-intents/runtime';
import { MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import { SP_MENU_TREE } from './solid-productivity-vocab';
import {
  menuTreeToSolidChanges,
  menuTreeToSolidCreateInput,
  SOLID_MENU_TREE_ID,
  solidMenuTreeQuery,
  solidThingToMenuTree,
} from './solid-menu-tree.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidMenuTreeContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidMenuTreeRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadMenuTree(): Promise<SolidRepositoryRead<MenuTreeState | null>> {
    const result = await this.queryMenuTreeThing();
    const existingThing = result.things[0] ?? null;
    return solidRepositoryRead(
      existingThing === null
        ? null
        : (solidThingToMenuTree(existingThing)?.menuTree ?? null),
      result.metadata,
    );
  }

  saveMenuTree(menuTree: MenuTreeState): Promise<MenuTreeState> {
    return this.writeQueue.enqueue(() => this.saveMenuTreeNow(menuTree));
  }

  private async saveMenuTreeNow(menuTree: MenuTreeState): Promise<MenuTreeState> {
    const existingThing = await this.findMenuTreeThing();

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        menuTreeToSolidCreateInput(menuTree, this.solidRuntime.menuTreeProfile),
      );
      const createdMenuTree = solidThingToMenuTree(created)?.menuTree;
      if (!createdMenuTree) {
        throw new Error('Expected Solid menu tree create result');
      }
      return createdMenuTree;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      menuTreeToSolidChanges(menuTree),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid menu tree update commit, received ${commit.kind}`);
    }

    const updatedMenuTree = solidThingToMenuTree(commit.result)?.menuTree;
    if (!updatedMenuTree) {
      throw new Error('Expected Solid menu tree update result');
    }
    return updatedMenuTree;
  }

  subscribeMenuTree(listener: (menuTree: MenuTreeState | null) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidMenuTreeQuery,
      (result) => {
        const thing = result.things[0];
        listener(thing ? (solidThingToMenuTree(thing)?.menuTree ?? null) : null);
      },
      {
        emitInitial: true,
      },
    );
  }

  private async findMenuTreeThing(): Promise<Thing | null> {
    const result = await this.queryMenuTreeThing();
    return result.things[0] ?? null;
  }

  private queryMenuTreeThing(): Promise<ThingQueryResult> {
    return this.solidRuntime.client.things.query(
      {
        ...solidMenuTreeQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_MENU_TREE.id,
            value: SOLID_MENU_TREE_ID,
          },
        ],
      },
      {
        limit: 1,
        scope: this.menuTreeContainerScope(),
        autoDiscover: false,
      },
    );
  }

  private menuTreeContainerScope(): SolidMenuTreeContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.menuTree,
    };
  }
}
