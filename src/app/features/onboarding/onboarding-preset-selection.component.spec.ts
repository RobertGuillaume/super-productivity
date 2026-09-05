import { TestBed } from '@angular/core/testing';
import {
  EnvironmentInjector,
  runInInjectionContext,
  signal,
  WritableSignal,
} from '@angular/core';
import { Subject } from 'rxjs';

import { OnboardingPresetSelectionComponent } from './onboarding-preset-selection.component';
import { ONBOARDING_PRESETS } from './onboarding-presets.const';
import { GlobalConfigService } from '../config/global-config.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { LS } from '../../core/persistence/storage-keys.const';
import { SolidRuntimeService } from '../../solid-data/solid-runtime.service';
import { SnackService } from '../../core/snack/snack.service';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_ISSUER_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from '../../solid-data/solid-data-layer-feature-flag';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';

describe('OnboardingPresetSelectionComponent', () => {
  let component: OnboardingPresetSelectionComponent;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let cfgSignal: WritableSignal<{ sync: { isEnabled: boolean } }>;
  let afterClosed$: Subject<void>;
  let authState: AuthState;
  let solidRuntime: jasmine.SpyObj<Pick<SolidRuntimeService, 'boot' | 'login'>> & {
    client: SolidRuntime;
  };
  let snackService: jasmine.SpyObj<SnackService>;

  const setup = (initialAuthState: AuthState = { status: 'anonymous' }): void => {
    cfgSignal = signal({ sync: { isEnabled: false } });
    afterClosed$ = new Subject<void>();
    authState = initialAuthState;

    solidRuntime = {
      boot: jasmine.createSpy('boot').and.resolveTo(undefined),
      login: jasmine.createSpy('login').and.resolveTo(undefined),
      client: {
        auth: {
          state: () => authState,
          subscribe: (subscriber: (state: AuthState) => void) => {
            subscriber(authState);
            return (): void => undefined;
          },
        },
      } as unknown as SolidRuntime,
    };
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({
      afterClosed: () => afterClosed$.asObservable(),
    } as unknown as MatDialogRef<unknown>);

    const mockGlobalConfig = jasmine.createSpyObj('GlobalConfigService', [], {
      cfg: cfgSignal,
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: GlobalConfigService, useValue: mockGlobalConfig },
        { provide: SolidRuntimeService, useValue: solidRuntime },
        { provide: SnackService, useValue: snackService },
      ],
    });

    runInInjectionContext(TestBed.inject(EnvironmentInjector), () => {
      component = new OnboardingPresetSelectionComponent();
    });
  };

  beforeEach(() => {
    localStorage.removeItem(LS.ONBOARDING_PRESET_DONE);
    localStorage.removeItem(LS.ONBOARDING_HINTS_DONE);
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY);
    setup();
  });

  afterEach(() => {
    localStorage.removeItem(LS.ONBOARDING_PRESET_DONE);
    localStorage.removeItem(LS.ONBOARDING_HINTS_DONE);
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY);
  });

  describe('Solid setup', () => {
    it('makes Solid primary and starts login from the onboarding screen', async () => {
      component.issuer = 'https://issuer.example';

      await component.connectSolid();

      expect(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY)).toBe('true');
      expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(
        'true',
      );
      expect(localStorage.getItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY)).toBe(
        'https://issuer.example',
      );
      expect(solidRuntime.boot).toHaveBeenCalledOnceWith({
        restoreSession: false,
        auth: {
          clientName: 'Super Productivity',
          redirectUrl: window.location.href,
        },
      });
      expect(solidRuntime.login).toHaveBeenCalledOnceWith('https://issuer.example');
    });

    it('dismisses onboarding after the primary Solid session is restored', async () => {
      TestBed.resetTestingModule();
      localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');
      setup({
        status: 'authenticated',
        webId: 'https://pod.example/profile/card#me',
      });
      let dismissedCount = 0;
      component.dismissed.subscribe(() => dismissedCount++);

      await Promise.resolve();

      expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBe('true');
      expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
      expect(dismissedCount).toBe(1);
    });

    it('keeps onboarding available when login fails', async () => {
      solidRuntime.login.and.rejectWith(new Error('login failed'));

      await component.connectSolid();

      expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();
      expect(component.isSolidSetupInProgress()).toBeFalse();
      expect(snackService.open).toHaveBeenCalled();
    });
  });

  describe('setupSync', () => {
    it('opens the sync config dialog', async () => {
      await component.setupSync();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    it('does nothing once a preset has been selected', async () => {
      component.selectedPreset.set(ONBOARDING_PRESETS[0]);
      await component.setupSync();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('dismisses onboarding when sync was enabled in the dialog', async () => {
      let dismissedCount = 0;
      component.dismissed.subscribe(() => dismissedCount++);

      await component.setupSync();
      expect(dismissedCount).toBe(0);
      expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();

      cfgSignal.set({ sync: { isEnabled: true } });
      afterClosed$.next();

      expect(dismissedCount).toBe(1);
      expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBe('true');
      expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
    });

    it('keeps onboarding open when sync was not enabled (dialog cancelled)', async () => {
      let dismissedCount = 0;
      component.dismissed.subscribe(() => dismissedCount++);

      await component.setupSync();
      afterClosed$.next();

      expect(dismissedCount).toBe(0);
      expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();
      expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBeNull();
    });

    it('does not open duplicate dialogs while sync setup is already active', async () => {
      const firstSetup = component.setupSync();
      const secondSetup = component.setupSync();

      await Promise.all([firstSetup, secondSetup]);

      expect(mockDialog.open).toHaveBeenCalledTimes(1);

      afterClosed$.next();
      await component.setupSync();

      expect(mockDialog.open).toHaveBeenCalledTimes(2);
    });

    it('does not open a stale dialog if a preset is selected while sync setup is loading', async () => {
      const setupPromise = component.setupSync();
      component.selectedPreset.set(ONBOARDING_PRESETS[0]);

      await setupPromise;

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(component.isSyncSetupInProgress()).toBeFalse();
    });
  });
});
