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

describe('SolidDataLayerPanelComponent', () => {
  let fixture: ComponentFixture<SolidDataLayerPanelComponent>;
  let solidRuntime: jasmine.SpyObj<
    Pick<SolidRuntimeService, 'boot' | 'login' | 'logout' | 'restoreSession'>
  > & { client: SolidRuntime };
  let snackService: jasmine.SpyObj<SnackService>;
  let uploadService: jasmine.SpyObj<SolidInitialUploadService>;
  let authState: AuthState;

  beforeEach(async () => {
    authState = { status: 'anonymous' };
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

  it('renders the experimental Solid control surface', () => {
    const component = fixture.componentInstance;

    expect(component.statusLabel()).toBe(T.PS.SOLID.STATUS_OFF);
    expect(fixture.nativeElement.textContent).toContain(T.PS.SOLID.TITLE);
    expect(fixture.nativeElement.textContent).toContain(T.PS.SOLID.LOGIN);
  });

  it('stores the issuer and starts Solid login outside the sync-provider flow', async () => {
    const component = fixture.componentInstance;
    component.issuer = 'https://issuer.example';

    await component.login();

    expect(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY)).toBe('true');
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

  it('keeps Solid primary mode disabled when initial upload is refused', async () => {
    uploadService.uploadCurrentDataToEmptyPod.and.resolveTo({ type: 'remote-not-empty' });

    await fixture.componentInstance.uploadCurrentData();

    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(null);
    expect(snackService.open).toHaveBeenCalledWith({
      type: 'ERROR',
      msg: T.PS.SOLID.REMOTE_NOT_EMPTY,
    });
  });
});
