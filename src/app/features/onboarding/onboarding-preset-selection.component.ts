import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { ONBOARDING_PRESETS, OnboardingPreset } from './onboarding-presets.const';
import { GlobalConfigService } from '../config/global-config.service';
import { LS } from '../../core/persistence/storage-keys.const';
import { SolidRuntimeService } from '../../solid-data/solid-runtime.service';
import { SolidDataLayerSettingsService } from '../../solid-data/solid-data-layer-settings.service';
import { SnackService } from '../../core/snack/snack.service';
import { T } from '../../t.const';
import { Log } from '../../core/log';
import type { AuthState } from '@solid-intents/runtime';

type DialogSyncCfgComponentType =
  typeof import('../../imex/sync/dialog-sync-cfg/dialog-sync-cfg.component').DialogSyncCfgComponent;

@Component({
  selector: 'onboarding-preset-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButton,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    TranslatePipe,
  ],
  templateUrl: './onboarding-preset-selection.component.html',
  styleUrl: './onboarding-preset-selection.component.scss',
})
export class OnboardingPresetSelectionComponent {
  private readonly _destroyRef = inject(DestroyRef);
  private _globalConfigService = inject(GlobalConfigService);
  private _matDialog = inject(MatDialog);
  private readonly _settings = inject(SolidDataLayerSettingsService);
  private readonly _snackService = inject(SnackService);
  private readonly _solidRuntime = inject(SolidRuntimeService);

  readonly T = T;
  presets = ONBOARDING_PRESETS;
  presetSelected = output<void>();
  dismissed = output<void>();
  selectedPreset = signal<OnboardingPreset | null>(null);
  isSyncSetupInProgress = signal(false);
  isSolidSetupInProgress = signal(false);
  isLocalSetupVisible = signal(false);
  issuer = this._settings.issuer();
  private _isSolidOnboardingComplete = false;

  constructor() {
    const unsubscribe = this._solidRuntime.client.auth.subscribe((state) => {
      queueMicrotask(() => this._completeSolidOnboardingIfAuthenticated(state));
    });
    this._destroyRef.onDestroy(unsubscribe);
  }

  showLocalSetup(): void {
    this.isLocalSetupVisible.set(true);
  }

  async connectSolid(): Promise<void> {
    if (this.selectedPreset() || this.isSolidSetupInProgress()) {
      return;
    }

    this.isSolidSetupInProgress.set(true);
    this._settings.setIssuer(this.issuer);
    this._settings.setEnabled(true);
    this._settings.setPrimaryEnabled(true);

    try {
      await this._solidRuntime.boot({
        restoreSession: false,
        auth: {
          clientName: 'Super Productivity',
          redirectUrl: window.location.href,
        },
      });
      await this._solidRuntime.login(this._settings.issuer());
    } catch (error) {
      this._settings.setPrimaryEnabled(false);
      Log.err('OnboardingPresetSelectionComponent: Solid login failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      this._snackService.open({
        type: 'ERROR',
        msg: T.PS.SOLID.ACTION_FAILED,
      });
    } finally {
      this.isSolidSetupInProgress.set(false);
    }
  }

  selectPreset(preset: OnboardingPreset): void {
    if (this.selectedPreset()) {
      return;
    }
    this.selectedPreset.set(preset);
    this._globalConfigService.updateSection('appFeatures', preset.features, true);
    localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');
    this.presetSelected.emit();
  }

  async setupSync(): Promise<void> {
    if (this.selectedPreset() || this.isSyncSetupInProgress()) {
      return;
    }
    this.isSyncSetupInProgress.set(true);

    let DialogSyncCfgComponent: DialogSyncCfgComponentType;
    try {
      ({ DialogSyncCfgComponent } =
        await import('../../imex/sync/dialog-sync-cfg/dialog-sync-cfg.component'));
    } catch (e) {
      this.isSyncSetupInProgress.set(false);
      throw e;
    }

    if (this.selectedPreset()) {
      this.isSyncSetupInProgress.set(false);
      return;
    }

    const dialogRef = this._matDialog.open(DialogSyncCfgComponent);
    dialogRef.afterClosed().subscribe(() => {
      this.isSyncSetupInProgress.set(false);
      // A returning user who actually enabled sync (e.g. to restore data from
      // another device) should not be forced to pick a preset afterwards —
      // that would overwrite the appFeatures config they just synced down.
      // Dismiss onboarding instead, without starting the new-user hint tour.
      if (this._globalConfigService.cfg()?.sync.isEnabled) {
        localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');
        localStorage.setItem(LS.ONBOARDING_HINTS_DONE, 'true');
        this.dismissed.emit();
      }
    });
  }

  private _completeSolidOnboardingIfAuthenticated(state: AuthState): void {
    if (
      this._isSolidOnboardingComplete ||
      !this._settings.isPrimaryEnabled() ||
      state.status !== 'authenticated'
    ) {
      return;
    }

    this._isSolidOnboardingComplete = true;
    localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');
    localStorage.setItem(LS.ONBOARDING_HINTS_DONE, 'true');
    this.dismissed.emit();
  }
}
