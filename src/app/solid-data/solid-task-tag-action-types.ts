import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskTagMembershipAction = ReturnType<
  typeof TaskSharedActions.addTagToTask
>;

export type SolidTaskTagBulkRemovalAction = ReturnType<
  typeof TaskSharedActions.removeTagsForAllTasks
>;

export const SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES = new Set<string>([
  TaskSharedActions.addTagToTask.type,
]);

export const SOLID_TASK_TAG_BULK_REMOVAL_ACTION_TYPES = new Set<string>([
  TaskSharedActions.removeTagsForAllTasks.type,
]);

export const SOLID_TASK_TAG_ACTION_TYPES = new Set<string>([
  ...SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES,
  ...SOLID_TASK_TAG_BULK_REMOVAL_ACTION_TYPES,
]);

export const isSolidTaskTagMembershipAction = (
  action: unknown,
): action is SolidTaskTagMembershipAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidTaskTagBulkRemovalAction = (
  action: unknown,
): action is SolidTaskTagBulkRemovalAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_TAG_BULK_REMOVAL_ACTION_TYPES.has((action as { type: string }).type);
