import { Action } from '@ngrx/store';
import {
  initialReminderState,
  reminderReducer,
} from '../features/reminder/store/reminder.reducer';
import { AppDataComplete } from '../op-log/model/model-config';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { classifySolidPersistentActionType } from './solid-persistent-action-ownership';

describe('Solid reminder persistence classification', () => {
  it('classifies reminder reducer persistence as loadAllData only', () => {
    const reminders = [
      {
        id: 'reminder-1',
        remindAt: 1710000000000,
        title: 'Loaded reminder',
        type: 'TASK' as const,
        relatedId: 'task-1',
      },
    ];

    const loaded = reminderReducer(
      initialReminderState,
      loadAllData({
        appDataComplete: {
          reminders,
        } as AppDataComplete,
      }),
    );

    expect(loaded).toEqual(reminders);
    expect(
      reminderReducer(loaded, {
        type: '[Reminder] Hypothetical Persistent Write',
      } as Action),
    ).toBe(loaded);
  });

  it('does not claim reminder writes as Solid-owned actions', () => {
    expect(
      classifySolidPersistentActionType('[Reminder] Hypothetical Persistent Write'),
    ).toBeNull();
  });
});
