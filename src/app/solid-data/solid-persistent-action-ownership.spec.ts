import { ActionType } from '../op-log/core/operation.types';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import {
  classifySolidPersistentActionType,
  SOLID_DEFERRED_PERSISTENT_ACTION_TYPES,
  SOLID_NON_APPLICABLE_PERSISTENT_ACTION_TYPES,
  SOLID_OWNED_PERSISTENT_ACTION_TYPES,
} from './solid-persistent-action-ownership';

describe('solid persistent action ownership', () => {
  it('classifies every ActionType exactly once', () => {
    const allActionTypes = Object.values(ActionType);

    expect(SOLID_DEFERRED_PERSISTENT_ACTION_TYPES.size).toBe(0);

    allActionTypes.forEach((actionType) => {
      const buckets = [
        SOLID_OWNED_PERSISTENT_ACTION_TYPES.has(actionType),
        SOLID_NON_APPLICABLE_PERSISTENT_ACTION_TYPES.has(actionType),
        SOLID_DEFERRED_PERSISTENT_ACTION_TYPES.has(actionType),
      ].filter(Boolean);

      expect(buckets.length).withContext(actionType).toBe(1);
      expect(classifySolidPersistentActionType(actionType))
        .withContext(actionType)
        .not.toBeNull();
    });
  });

  it('classifies every TaskSharedActions member exactly once', () => {
    Object.values(TaskSharedActions)
      .map((actionCreator) => (actionCreator as { type?: unknown }).type)
      .filter((actionType): actionType is string => typeof actionType === 'string')
      .forEach((actionType) => {
        expect(classifySolidPersistentActionType(actionType))
          .withContext(actionType)
          .not.toBeNull();
      });
  });

  it('keeps system and load-only actions out of Solid-owned writes', () => {
    [
      ActionType.ARCHIVE_REMOTE_DATA_APPLIED,
      ActionType.LOAD_ALL_DATA,
      ActionType.LOAD_BACKUP_DATA,
      ActionType.MIGRATION_GENESIS_IMPORT,
      ActionType.RECOVERY_DATA_IMPORT,
      ActionType.REPAIR_AUTO,
    ].forEach((actionType) => {
      expect(classifySolidPersistentActionType(actionType))
        .withContext(actionType)
        .toBe('non-applicable');
    });
  });
});
