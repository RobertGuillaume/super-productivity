import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { TranslateModule } from '@ngx-translate/core';
import {
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_ISSUER_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';
import { SolidDataLayerPanelComponent } from './solid-data-layer-panel.component';
import { SolidInitialUploadService } from './solid-initial-upload.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { SolidPodRefreshCoordinatorService } from './solid-pod-refresh-coordinator.service';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { signal, WritableSignal } from '@angular/core';

describe('SolidDataLayerPanelComponent', () => {
  let fixture: ComponentFixture<SolidDataLayerPanelComponent>;
  let solidRuntime: jasmine.SpyObj<
    Pick<SolidRuntimeService, 'boot' | 'login' | 'logout' | 'restoreSession'>
  > & { client: SolidRuntime };
  let snackService: jasmine.SpyObj<SnackService>;
  let uploadService: jasmine.SpyObj<SolidInitialUploadService>;
  let refreshCoordinator: jasmine.SpyObj<SolidPodRefreshCoordinatorService>;
  let authState: AuthState;
  let rateLimitedUntil: WritableSignal<Date | null>;

  beforeEach(async () => {
    authState = { status: 'anonymous' };
    rateLimitedUntil = signal<Date | null>(null);
    solidRuntime = {
      boot: jasmine.createSpy('boot').and.resolveTo(authState),
      login: jasmine.createSpy('login').and.resolveTo(authState),
      logout: jasmine.createSpy('logout').and.resolveTo(undefined),
      restoreSession: jasmine.createSpy('restoreSession').and.resolveTo(authState),
      client: {
        auth: {
          state: () => authState,
          subscribe: () => (): void => undefined,
        },
      } as unknown as SolidRuntime,
    };
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    uploadService = jasmine.createSpyObj<SolidInitialUploadService>(
      'SolidInitialUploadService',
      ['uploadCurrentDataToEmptyPod'],
    );
    refreshCoordinator = jasmine.createSpyObj<SolidPodRefreshCoordinatorService>(
      'SolidPodRefreshCoordinatorService',
      ['refreshNow', 'restartAfterRuntimeBoot'],
    );
    refreshCoordinator.restartAfterRuntimeBoot.and.resolveTo();
    refreshCoordinator.refreshNow.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [
        NoopAnimationsModule,
        SolidDataLayerPanelComponent,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: SolidRuntimeService, useValue: solidRuntime },
        { provide: SnackService, useValue: snackService },
        { provide: SolidInitialUploadService, useValue: uploadService },
        { provide: SolidPodRefreshCoordinatorService, useValue: refreshCoordinator },
        {
          provide: SolidDataLayerStateService,
          useValue: { phase: signal('disabled'), rateLimitedUntil },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SolidDataLayerPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('renders the primary Solid control surface', () => {
    const component = fixture.componentInstance;

    expect(component.statusLabel()).toBe(T.PS.SOLID.STATUS_OFF);
    expect(fixture.nativeElement.textContent).toContain(T.PS.SOLID.TITLE);
    expect(fixture.nativeElement.textContent).toContain(T.PS.SOLID.LOGIN);
  });

  it('shows runtime rate limiting through the quiet status label', () => {
    rateLimitedUntil.set(new Date(Date.now() + 1_000));

    expect(fixture.componentInstance.statusLabel()).toBe(T.PS.SOLID.STATUS_RATE_LIMITED);
    expect(snackService.open).not.toHaveBeenCalled();
  });

  it('stores the issuer and starts Solid login outside the sync-provider flow', async () => {
    const component = fixture.componentInstance;
    component.issuer = 'https://issuer.example';

    await component.login();

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

  it('does not leave Solid primary when login fails', async () => {
    solidRuntime.login.and.rejectWith(new Error('login failed'));

    await fixture.componentInstance.login();

    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBeNull();
    expect(snackService.open).toHaveBeenCalledWith({
      type: 'ERROR',
      msg: T.PS.SOLID.ACTION_FAILED,
    });
  });

  it('keeps Solid primary mode disabled when initial upload is refused', async () => {
    uploadService.uploadCurrentDataToEmptyPod.and.resolveTo({ type: 'remote-not-empty' });

    await fixture.componentInstance.uploadCurrentData();

    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(null);
    expect(snackService.open).toHaveBeenCalledWith({
      type: 'ERROR',
      msg: T.PS.SOLID.REMOTE_NOT_EMPTY,
    });
  });

  it('can use an existing Pod without uploading local data first', async () => {
    const component = fixture.componentInstance;
    component.authState.set({
      status: 'authenticated',
      webId: 'https://pod.example/profile/card#me',
    });
    const reloadFromPod = spyOn(component, 'reloadFromPod');
    (window.confirm as jasmine.Spy).and.returnValue(true);
    fixture.detectChanges();

    component.activatePod();
    await fixture.whenStable();

    expect(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY)).toBe('true');
    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(
      'true',
    );
    expect(uploadService.uploadCurrentDataToEmptyPod).not.toHaveBeenCalled();
    expect(reloadFromPod).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(T.PS.SOLID.RELOAD_FROM_POD);
  });

  it('refreshes Pod data in process without reloading the browser', async () => {
    await fixture.componentInstance.reloadFromPod();

    expect(refreshCoordinator.refreshNow).toHaveBeenCalledTimes(1);
  });
});
