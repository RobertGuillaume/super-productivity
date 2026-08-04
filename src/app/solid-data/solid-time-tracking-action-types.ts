import {
  syncTimeTracking,
  updateWorkContextData,
} from '../features/time-tracking/store/time-tracking.actions';

export type SolidTimeTrackingSaveAction =
  | ReturnType<typeof updateWorkContextData>
  | ReturnType<typeof syncTimeTracking>;

export const SOLID_TIME_TRACKING_ACTION_TYPES = new Set<string>([
  updateWorkContextData.type,
  syncTimeTracking.type,
]);

export const isSolidTimeTrackingSaveAction = (
  action: unknown,
): action is SolidTimeTrackingSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TIME_TRACKING_ACTION_TYPES.has((action as { type: string }).type);
