import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidStartupService } from './solid-startup.service';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';

describe('SolidStartupService', () => {
  let solidRuntime: jasmine.SpyObj<SolidRuntimeService>;
  let authState: AuthState;
  let sessionRecovery: jasmine.SpyObj<SolidSessionRecoveryService>;

  beforeEach(() => {
    authState = { status: 'anonymous' };
    solidRuntime = jasmine.createSpyObj<SolidRuntimeService>(
      'SolidRuntimeService',
      ['boot', 'activateRememberedStorageRoot'],
      {
        client: {
          auth: {
            state: () => authState,
          },
        } as SolidRuntime,
      },
    );
    solidRuntime.activateRememberedStorageRoot.and.resolveTo({
      status: 'unavailable',
      changed: false,
      webId: '',
    });
    sessionRecovery = jasmine.createSpyObj<SolidSessionRecoveryService>(
      'SolidSessionRecoveryService',
      ['promptForLogin'],
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidRuntimeService, useValue: solidRuntime },
        { provide: SolidSessionRecoveryService, useValue: sessionRecovery },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('prompts for login when a primary Solid session cannot be restored', async () => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
    const service = TestBed.inject(SolidStartupService);

    await expectAsync(service.bootIfEnabled()).toBeResolvedTo({ status: 'anonymous' });

    expect(sessionRecovery.promptForLogin).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the Solid data layer is disabled', async () => {
    const service = TestBed.inject(SolidStartupService);

    await expectAsync(service.bootIfEnabled()).toBeResolvedTo(null);
    expect(solidRuntime.boot).not.toHaveBeenCalled();
  });

  it('boots the runtime and returns auth state when enabled', async () => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');
    authState = { status: 'authenticated', webId: 'https://user.example/#me' };
    const service = TestBed.inject(SolidStartupService);

    await expectAsync(service.bootIfEnabled()).toBeResolvedTo(authState);
    expect(solidRuntime.boot).toHaveBeenCalledOnceWith({
      restoreSession: true,
      auth: {
        clientName: 'Super Productivity',
        redirectUrl: window.location.href,
      },
    });
    expect(solidRuntime.activateRememberedStorageRoot).toHaveBeenCalledTimes(1);
  });
});
