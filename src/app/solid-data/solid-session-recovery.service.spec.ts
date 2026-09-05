import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SolidRuntime } from '@solid-intents/runtime';
import { SnackParams } from '../core/snack/snack.model';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { SolidDataLayerSettingsService } from './solid-data-layer-settings.service';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  isSolidAuthenticationError,
  SolidSessionRecoveryService,
} from './solid-session-recovery.service';

describe('SolidSessionRecoveryService', () => {
  let runtime: jasmine.SpyObj<
    Pick<SolidRuntimeService, 'boot' | 'login' | 'restoreSession'>
  > & {
    client: SolidRuntime;
  };
  let settings: jasmine.SpyObj<SolidDataLayerSettingsService>;
  let snackService: jasmine.SpyObj<SnackService>;

  beforeEach(() => {
    runtime = {
      boot: jasmine.createSpy('boot').and.resolveTo(undefined),
      login: jasmine.createSpy('login').and.resolveTo(undefined),
      restoreSession: jasmine
        .createSpy('restoreSession')
        .and.resolveTo({ status: 'anonymous' }),
      client: {
        auth: {
          state: () => ({ status: 'authenticated', webId: 'https://pod.example/#me' }),
        },
      } as SolidRuntime,
    };
    settings = jasmine.createSpyObj<SolidDataLayerSettingsService>(
      'SolidDataLayerSettingsService',
      ['setEnabled', 'setPrimaryEnabled'],
      { issuer: signal('https://issuer.example') },
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);

    TestBed.configureTestingModule({
      providers: [
        { provide: SolidRuntimeService, useValue: runtime },
        { provide: SolidDataLayerSettingsService, useValue: settings },
        { provide: SnackService, useValue: snackService },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('recognizes expired sessions and nested 401 responses', () => {
    expect(isSolidAuthenticationError(new Error('Authentication session expired'))).toBe(
      true,
    );
    expect(
      isSolidAuthenticationError({
        name: 'NetworkRequestError',
        cause: { response: { status: 401 } },
      }),
    ).toBe(true);
    expect(isSolidAuthenticationError({ response: { status: 403 } })).toBe(false);
  });

  it('shows one sticky sign-in prompt for repeated authentication failures', async () => {
    const service = TestBed.inject(SolidSessionRecoveryService);

    expect(
      service.handleAuthenticationError(new Error('Authentication session expired')),
    ).toBe(true);
    expect(service.handleAuthenticationError({ response: { status: 401 } })).toBe(true);

    expect(snackService.open).toHaveBeenCalledTimes(1);
    expect(snackService.open).toHaveBeenCalledWith({
      type: 'ERROR',
      msg: T.PS.SOLID.SESSION_EXPIRED,
      actionStr: T.PS.SOLID.LOGIN_AGAIN,
      actionFn: jasmine.any(Function) as unknown as () => void,
      config: { duration: 0 },
    });
    await Promise.resolve();
    expect(runtime.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('starts Solid login directly from the recovery action', async () => {
    const service = TestBed.inject(SolidSessionRecoveryService);
    service.promptForLogin();
    const prompt = snackService.open.calls.mostRecent().args[0] as SnackParams;

    prompt.actionFn?.();
    await Promise.resolve();

    expect(settings.setEnabled).toHaveBeenCalledWith(true);
    expect(settings.setPrimaryEnabled).toHaveBeenCalledWith(true);
    expect(runtime.boot).toHaveBeenCalledOnceWith({
      restoreSession: false,
      auth: {
        clientName: 'Super Productivity',
        redirectUrl: window.location.href,
      },
    });
    expect(runtime.login).toHaveBeenCalledOnceWith('https://issuer.example');
  });
});
