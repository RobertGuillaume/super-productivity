import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidProjectDeleteAction = ReturnType<typeof TaskSharedActions.deleteProject>;

export const SOLID_PROJECT_DELETE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.deleteProject.type,
]);

export const isSolidProjectDeleteAction = (
  action: unknown,
): action is SolidProjectDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_PROJECT_DELETE_ACTION_TYPES.has((action as { type: string }).type);
