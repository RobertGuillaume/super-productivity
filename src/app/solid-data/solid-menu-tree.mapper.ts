import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import {
  SOLID_PRODUCTIVITY_MENU_TREE_CONTAINER,
  SOLID_PRODUCTIVITY_MENU_TREE_TYPE,
  SP_MENU_TREE,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringProp,
} from './solid-rdf.mapper-helpers';

export const SOLID_MENU_TREE_ID = 'menu-tree';

export interface SolidMenuTree {
  id: typeof SOLID_MENU_TREE_ID;
  menuTree: MenuTreeState;
  updated: number;
}

export const menuTreeToSolidCreateInput = (
  menuTree: MenuTreeState,
  profile: ThingWriteProfile,
  updated = Date.now(),
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_MENU_TREE_CONTAINER,
    resourceName: SOLID_MENU_TREE_ID,
  },
  title: 'Menu tree',
  facets: {
    title: 'Menu tree',
    status: 'active',
  },
  properties: menuTreeToSolidProperties(menuTree, updated),
});

export const menuTreeToSolidChanges = (
  menuTree: MenuTreeState,
  updated = Date.now(),
): ThingChanges => ({
  title: 'Menu tree',
  status: 'active',
  replaceProperties: buildMenuTreeSolidProperties(menuTree, updated),
});

export const menuTreeToSolidProperties = (
  menuTree: MenuTreeState,
  updated = Date.now(),
): ThingRdfPropertyInput => buildMenuTreeSolidProperties(menuTree, updated);

export const solidThingToMenuTree = (thing: Thing): SolidMenuTree | null => {
  const projectTree = jsonProp<MenuTreeState['projectTree']>(
    thing,
    SP_MENU_TREE.projectTree,
  );
  const tagTree = jsonProp<MenuTreeState['tagTree']>(thing, SP_MENU_TREE.tagTree);
  if (!projectTree || !tagTree) {
    return null;
  }

  return {
    id:
      (stringProp(thing, SP_MENU_TREE.id) as typeof SOLID_MENU_TREE_ID) ??
      SOLID_MENU_TREE_ID,
    menuTree: {
      projectTree,
      tagTree,
    },
    updated: numberProp(thing, SP_MENU_TREE.updated) ?? 0,
  };
};

export const solidMenuTreeQuery = {
  type: SOLID_PRODUCTIVITY_MENU_TREE_TYPE,
} as const;

const buildMenuTreeSolidProperties = (
  menuTree: MenuTreeState,
  updated: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_MENU_TREE.id, SOLID_MENU_TREE_ID);
  addLiteral(properties, SP_MENU_TREE.updated, updated);
  addJson(properties, SP_MENU_TREE.projectTree, menuTree.projectTree);
  addJson(properties, SP_MENU_TREE.tagTree, menuTree.tagTree);

  return properties;
};
