import { addTag, deleteTag, deleteTags } from '../features/tag/store/tag.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import {
  deleteFolder,
  updateFolder,
  updateProjectTree,
  updateTagTree,
} from '../features/menu-tree/store/menu-tree.actions';

export type SolidMenuTreeSaveAction =
  | ReturnType<typeof updateProjectTree>
  | ReturnType<typeof updateTagTree>
  | ReturnType<typeof deleteFolder>
  | ReturnType<typeof updateFolder>
  | ReturnType<typeof TaskSharedActions.deleteProject>
  | ReturnType<typeof addTag>
  | ReturnType<typeof deleteTag>
  | ReturnType<typeof deleteTags>;

export const SOLID_MENU_TREE_ACTION_TYPES = new Set<string>([
  updateProjectTree.type,
  updateTagTree.type,
  deleteFolder.type,
  updateFolder.type,
  TaskSharedActions.deleteProject.type,
  addTag.type,
  deleteTag.type,
  deleteTags.type,
]);

export const isSolidMenuTreeSaveAction = (
  action: unknown,
): action is SolidMenuTreeSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_MENU_TREE_ACTION_TYPES.has((action as { type: string }).type);
