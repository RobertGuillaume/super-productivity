import { Action, ActionReducer } from '@ngrx/store';
import {
  isPersistentAction,
  PersistentAction,
} from '../op-log/core/persistent-action.interface';

interface SolidMutationGuardPolicy {
  owns(action: PersistentAction): boolean;
  canApply(action: PersistentAction): boolean;
  onBlocked(action: PersistentAction): void;
}

let policy: SolidMutationGuardPolicy | null = null;
const blockedActions = new WeakSet<object>();

export const configureSolidMutationGuard = (
  nextPolicy: SolidMutationGuardPolicy,
): void => {
  policy = nextPolicy;
};

export const resetSolidMutationGuard = (): void => {
  policy = null;
};

export const isSolidMutationBlocked = (action: Action): boolean =>
  blockedActions.has(action);

/** Blocks a complete Solid-owned intent before any state-changing reducer sees it. */
export const solidMutationGuardMetaReducer = <T>(
  reducer: ActionReducer<T>,
): ActionReducer<T> => {
  return (state: T | undefined, action: Action): T => {
    if (
      policy === null ||
      !isPersistentAction(action) ||
      action.meta.isRemote ||
      !policy.owns(action) ||
      policy.canApply(action)
    ) {
      return reducer(state, action);
    }

    blockedActions.add(action);
    policy.onBlocked(action);
    return state ?? reducer(undefined, { type: '@ngrx/store/init' });
  };
};
