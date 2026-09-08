import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import {
  MenuTreeKind,
  MenuTreeState,
  MenuTreeTreeNode,
} from '../features/menu-tree/store/menu-tree.model';
import { TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';

/**
 * Supplies the denormalized navigation indexes expected by the sidebar without
 * turning hydration into a persistent menu-tree edit.
 */
export const normalizeSolidMenuTreeProjection = (
  menuTree: MenuTreeState,
  projects: readonly Project[],
  tags: readonly Tag[],
): MenuTreeState => ({
  projectTree: appendMissingNodes(
    menuTree.projectTree,
    projects
      .filter(
        (project) =>
          project.id !== INBOX_PROJECT.id &&
          !project.isArchived &&
          !project.isHiddenFromMenu,
      )
      .map((project) => project.id),
    MenuTreeKind.PROJECT,
  ),
  tagTree: appendMissingNodes(
    menuTree.tagTree,
    tags.filter((tag) => tag.id !== TODAY_TAG.id).map((tag) => tag.id),
    MenuTreeKind.TAG,
  ),
});

const appendMissingNodes = (
  tree: readonly MenuTreeTreeNode[],
  visibleIds: readonly string[],
  kind: MenuTreeKind.PROJECT | MenuTreeKind.TAG,
): MenuTreeTreeNode[] => {
  const placedIds = new Set<string>();
  collectPlacedIds(tree, kind, placedIds);

  return [
    ...tree,
    ...visibleIds
      .filter((id) => !placedIds.has(id))
      .map((id) => ({ id, k: kind }) as MenuTreeTreeNode),
  ];
};

const collectPlacedIds = (
  nodes: readonly MenuTreeTreeNode[],
  kind: MenuTreeKind.PROJECT | MenuTreeKind.TAG,
  placedIds: Set<string>,
): void => {
  for (const node of nodes) {
    if (node.k === kind) {
      placedIds.add(node.id);
    } else if (node.k === MenuTreeKind.FOLDER) {
      collectPlacedIds(node.children, kind, placedIds);
    }
  }
};
