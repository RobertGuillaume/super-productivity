import {
  addSimpleCounter,
  deleteSimpleCounter,
  deleteSimpleCounters,
  setSimpleCounterCounterForDate,
  setSimpleCounterCounterToday,
  syncSimpleCounterTime,
  updateAllSimpleCounters,
  updateSimpleCounter,
  updateSimpleCounterOrder,
} from '../features/simple-counter/store/simple-counter.actions';

export type SolidSimpleCounterSaveAction =
  | ReturnType<typeof addSimpleCounter>
  | ReturnType<typeof updateSimpleCounter>
  | ReturnType<typeof updateAllSimpleCounters>
  | ReturnType<typeof setSimpleCounterCounterToday>
  | ReturnType<typeof setSimpleCounterCounterForDate>
  | ReturnType<typeof updateSimpleCounterOrder>
  | ReturnType<typeof syncSimpleCounterTime>;

export type SolidSimpleCounterDeleteAction =
  | ReturnType<typeof deleteSimpleCounter>
  | ReturnType<typeof deleteSimpleCounters>;

export type SolidSimpleCounterAction =
  | SolidSimpleCounterSaveAction
  | SolidSimpleCounterDeleteAction;

export const SOLID_SIMPLE_COUNTER_SAVE_ACTION_TYPES = new Set<string>([
  addSimpleCounter.type,
  updateSimpleCounter.type,
  updateAllSimpleCounters.type,
  setSimpleCounterCounterToday.type,
  setSimpleCounterCounterForDate.type,
  updateSimpleCounterOrder.type,
  syncSimpleCounterTime.type,
]);

export const SOLID_SIMPLE_COUNTER_DELETE_ACTION_TYPES = new Set<string>([
  deleteSimpleCounter.type,
  deleteSimpleCounters.type,
]);

export const SOLID_SIMPLE_COUNTER_ACTION_TYPES = new Set<string>([
  ...SOLID_SIMPLE_COUNTER_SAVE_ACTION_TYPES,
  ...SOLID_SIMPLE_COUNTER_DELETE_ACTION_TYPES,
]);

export const isSolidSimpleCounterSaveAction = (
  action: unknown,
): action is SolidSimpleCounterSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_SIMPLE_COUNTER_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidSimpleCounterDeleteAction = (
  action: unknown,
): action is SolidSimpleCounterDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_SIMPLE_COUNTER_DELETE_ACTION_TYPES.has((action as { type: string }).type);
