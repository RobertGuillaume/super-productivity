import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidTaskTagMembershipAction = ReturnType<
  typeof TaskSharedActions.addTagToTask
>;

export const SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES = new Set<string>([
  TaskSharedActions.addTagToTask.type,
]);

export const isSolidTaskTagMembershipAction = (
  action: unknown,
): action is SolidTaskTagMembershipAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TASK_TAG_MEMBERSHIP_ACTION_TYPES.has((action as { type: string }).type);
