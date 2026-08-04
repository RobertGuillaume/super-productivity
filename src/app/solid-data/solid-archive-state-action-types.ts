import { flushYoungToOld } from '../features/archive/store/archive.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidArchiveStateAction =
  | ReturnType<typeof TaskSharedActions.moveToArchive>
  | ReturnType<typeof flushYoungToOld>;

export const SOLID_ARCHIVE_STATE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.moveToArchive.type,
  flushYoungToOld.type,
]);

export const isSolidArchiveStateAction = (
  action: unknown,
): action is SolidArchiveStateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_ARCHIVE_STATE_ACTION_TYPES.has((action as { type: string }).type);
