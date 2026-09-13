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
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidMenuTreeContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidMenuTreeRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadMenuTree(): Promise<SolidRepositoryRead<MenuTreeState | null>> {
    const result = await this.queryMenuTreeThing();
    const existingThing = result.things[0] ?? null;
    const menuTree = existingThing === null ? null : this.mapMenuTree(existingThing);
    return solidRepositoryRead(menuTree, result.metadata);
  }

  saveMenuTree(menuTree: MenuTreeState): Promise<MenuTreeState> {
    return this.mutationCoordinator.run(solidMutationKey('menuTree', 'root'), () =>
      this.saveMenuTreeNow(menuTree),
    );
  }

  private async saveMenuTreeNow(menuTree: MenuTreeState): Promise<MenuTreeState> {
    return this.operations.upsert({
      model: 'menuTree',
      id: 'root',
      value: menuTree,
      resourceName: SOLID_MENU_TREE_ID,
      profile: this.solidRuntime.menuTreeProfile,
      createInput: menuTreeToSolidCreateInput(
        menuTree,
        this.solidRuntime.menuTreeProfile,
      ),
      changes: menuTreeToSolidChanges(menuTree),
      map: (thing) => this.mapMenuTree(thing),
    });
  }

  private mapMenuTree(thing: Thing): MenuTreeState {
    const menuTree = solidThingToMenuTree(thing)?.menuTree;
    if (menuTree === undefined) {
      throw new Error('Expected Solid menu tree result');
    }
    return this.operations.remember('menuTree', 'root', thing, menuTree);
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
