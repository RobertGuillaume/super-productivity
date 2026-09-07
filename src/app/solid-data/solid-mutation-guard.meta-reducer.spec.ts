import { ActionReducer } from '@ngrx/store';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { EntityType, OpType } from '../op-log/core/operation.types';
import {
  configureSolidMutationGuard,
  isSolidMutationBlocked,
  resetSolidMutationGuard,
  solidMutationGuardMetaReducer,
} from './solid-mutation-guard.meta-reducer';

describe('solidMutationGuardMetaReducer', () => {
  const action: PersistentAction = {
    type: '[TaskShared] Update Task',
    meta: {
      isPersistent: true,
      entityType: 'TASK' as EntityType,
      entityId: 'task-1',
      opType: OpType.Update,
    },
  };

  afterEach(() => resetSolidMutationGuard());

  it('blocks the complete intent and marks it for LOCAL_ACTIONS filtering', () => {
    const reducer = jasmine.createSpy<ActionReducer<number>>('reducer');
    const onBlocked = jasmine.createSpy('onBlocked');
    configureSolidMutationGuard({
      owns: () => true,
      canApply: () => false,
      onBlocked,
    });

    const result = solidMutationGuardMetaReducer(reducer)(1, action);

    expect(result).toBe(1);
    expect(reducer).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledOnceWith(action);
    expect(isSolidMutationBlocked(action)).toBe(true);
  });

  it('passes write-ready and nonpersistent actions to reducers', () => {
    const reducer: ActionReducer<number> = (state) => (state ?? 0) + 1;
    configureSolidMutationGuard({
      owns: () => true,
      canApply: () => true,
      onBlocked: () => undefined,
    });
    const wrapped = solidMutationGuardMetaReducer(reducer);

    expect(wrapped(1, action)).toBe(2);
    expect(wrapped(1, { type: '[Layout] Select' })).toBe(2);
  });
});
