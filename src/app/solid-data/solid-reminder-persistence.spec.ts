import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { Action } from '@ngrx/store';
import {
  initialReminderState,
  reminderReducer,
} from '../features/reminder/store/reminder.reducer';
import { AppDataComplete } from '../op-log/model/model-config';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { OpType } from '../op-log/core/operation.types';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SOLID_DATA_LAYER_ENABLED_STORAGE_KEY } from './solid-data-layer-feature-flag';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('Solid reminder persistence classification', () => {
  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

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
    let authState: AuthState = {
      status: 'authenticated',
      webId: 'https://user.example/#me',
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            client: {
              auth: {
                state: () => authState,
              },
            } as SolidRuntime,
          },
        },
      ],
    });
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');

    const service = TestBed.inject(SolidDataLayerStateService);

    expect(
      service.ownsPersistentAction({
        type: '[Reminder] Hypothetical Persistent Write',
        meta: {
          isPersistent: true,
          entityType: 'REMINDER',
          entityId: 'reminder-1',
          opType: OpType.Update,
        },
      } as PersistentAction),
    ).toBe(false);

    authState = { status: 'anonymous' };
  });
});
