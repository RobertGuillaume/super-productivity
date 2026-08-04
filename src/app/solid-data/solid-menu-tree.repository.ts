import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
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

type SolidMenuTreeContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidMenuTreeRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadMenuTree(): Promise<MenuTreeState | null> {
    const menuTreeContainerScope = this.menuTreeContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [menuTreeContainerScope.uri],
      mode: 'balanced',
    });

    const existingThing = await this.findMenuTreeThing();
    if (existingThing === null) {
      return null;
    }

    return solidThingToMenuTree(existingThing)?.menuTree ?? null;
  }

  async saveMenuTree(menuTree: MenuTreeState): Promise<MenuTreeState> {
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
    const result = await this.solidRuntime.client.things.query(
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
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private menuTreeContainerScope(): SolidMenuTreeContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.menuTree,
    };
  }
}
