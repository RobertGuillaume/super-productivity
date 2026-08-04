import {
  addMetric,
  deleteMetric,
  logFocusSession,
  updateMetric,
  upsertMetric,
} from '../features/metric/store/metric.actions';

export type SolidMetricSaveAction =
  | ReturnType<typeof addMetric>
  | ReturnType<typeof updateMetric>
  | ReturnType<typeof upsertMetric>
  | ReturnType<typeof logFocusSession>;

export type SolidMetricDeleteAction = ReturnType<typeof deleteMetric>;

export type SolidMetricAction = SolidMetricSaveAction | SolidMetricDeleteAction;

export const SOLID_METRIC_SAVE_ACTION_TYPES = new Set<string>([
  addMetric.type,
  updateMetric.type,
  upsertMetric.type,
  logFocusSession.type,
]);

export const SOLID_METRIC_DELETE_ACTION_TYPES = new Set<string>([deleteMetric.type]);

export const SOLID_METRIC_ACTION_TYPES = new Set<string>([
  ...SOLID_METRIC_SAVE_ACTION_TYPES,
  ...SOLID_METRIC_DELETE_ACTION_TYPES,
]);

export const isSolidMetricSaveAction = (
  action: unknown,
): action is SolidMetricSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_METRIC_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidMetricDeleteAction = (
  action: unknown,
): action is SolidMetricDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_METRIC_DELETE_ACTION_TYPES.has((action as { type: string }).type);
