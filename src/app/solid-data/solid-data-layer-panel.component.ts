import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { AuthState } from '@solid-intents/runtime';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { confirmDialog } from '../util/native-dialogs';
import { SolidDataLayerSettingsService } from './solid-data-layer-settings.service';
import {
  SolidInitialUploadResult,
  SolidInitialUploadService,
} from './solid-initial-upload.service';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidPodRefreshCoordinatorService } from './solid-pod-refresh-coordinator.service';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';

@Component({
  selector: 'solid-data-layer-panel',
  templateUrl: './solid-data-layer-panel.component.html',
  styleUrls: ['./solid-data-layer-panel.component.scss'],
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
})
export class SolidDataLayerPanelComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly settings = inject(SolidDataLayerSettingsService);
  private readonly snackService = inject(SnackService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly translateService = inject(TranslateService);
  private readonly uploadService = inject(SolidInitialUploadService);
  private readonly refreshCoordinator = inject(SolidPodRefreshCoordinatorService);
  private readonly dataLayerState = inject(SolidDataLayerStateService);

  readonly T = T;
  readonly authState = signal<AuthState>(this.solidRuntime.client.auth.state());
  readonly isBusy = signal(false);
  readonly isEnabled = this.settings.isEnabled;
  readonly isPrimaryEnabled = this.settings.isPrimaryEnabled;
  readonly lifecyclePhase = this.dataLayerState.phase;
  readonly isRefreshing = computed(() => this.lifecyclePhase() === 'refreshing');
  readonly webId = computed(() => {
    const authState = this.authState();
    return authState.status === 'authenticated' ? authState.webId : null;
  });
  readonly statusLabel = computed(() => {
    const authState = this.authState();
    const phase = this.lifecyclePhase();
    if (phase === 'booting' || phase === 'hydrating-cache') {
      return T.PS.SOLID.STATUS_CONNECTING;
    }
    if (phase === 'refreshing') {
      return T.PS.SOLID.STATUS_REFRESHING;
    }
    if (phase === 'degraded' || phase === 'unavailable') {
      return T.PS.SOLID.STATUS_DEGRADED;
    }
    if (phase === 'sign-in-required') {
      return T.PS.SOLID.STATUS_SIGN_IN_REQUIRED;
    }
    if (this.isPrimaryEnabled() && authState.status === 'authenticated') {
      return T.PS.SOLID.STATUS_ACTIVE;
    }
    if (authState.status === 'authenticated') {
      return T.PS.SOLID.STATUS_CONNECTED;
    }
    if (this.isEnabled()) {
      return T.PS.SOLID.STATUS_ENABLED;
    }
    return T.PS.SOLID.STATUS_OFF;
  });

  issuer = this.settings.issuer();

  constructor() {
    const unsubscribe = this.solidRuntime.client.auth.subscribe((state) => {
      this.authState.set(state);
    });
    this.destroyRef.onDestroy(unsubscribe);
  }

  disable(): void {
    if (!confirmDialog(this.translateService.instant(T.PS.SOLID.CONFIRM_DISABLE))) {
      return;
    }

    this.settings.setEnabled(false);
    this.snackService.open({
      type: 'SUCCESS',
      msg: T.PS.SOLID.DISABLED,
      actionStr: T.PS.RELOAD,
      actionFn: (): void => window.location.reload(),
    });
  }

  activatePod(): void {
    if (this.authState().status !== 'authenticated') {
      this.snackService.open({
        type: 'ERROR',
        msg: T.PS.SOLID.SIGN_IN_REQUIRED,
      });
      return;
    }
    if (!confirmDialog(this.translateService.instant(T.PS.SOLID.CONFIRM_ACTIVATE))) {
      return;
    }

    this.settings.setEnabled(true);
    this.settings.setPrimaryEnabled(true);
    this.reloadFromPod();
  }

  async reloadFromPod(): Promise<void> {
    await this.runBusy(() => this.refreshCoordinator.refreshNow());
  }

  async login(): Promise<void> {
    await this.runBusy(async () => {
      this.settings.setIssuer(this.issuer);
      this.settings.setEnabled(true);
      this.settings.setPrimaryEnabled(true);
      try {
        await this.solidRuntime.boot({
          restoreSession: false,
          auth: {
            clientName: 'Super Productivity',
            redirectUrl: window.location.href,
          },
        });
        await this.solidRuntime.login(this.settings.issuer());
      } catch (error) {
        this.settings.setPrimaryEnabled(false);
        throw error;
      }
    });
  }

  async restoreSession(): Promise<void> {
    await this.runBusy(async () => {
      this.settings.setEnabled(true);
      this.authState.set(await this.solidRuntime.restoreSession());
    });
  }

  async logout(): Promise<void> {
    await this.runBusy(async () => {
      await this.solidRuntime.logout();
      this.settings.setPrimaryEnabled(false);
      this.authState.set(this.solidRuntime.client.auth.state());
    });
  }

  async uploadCurrentData(): Promise<void> {
    await this.runBusy(async () => {
      const result = await this.uploadService.uploadCurrentDataToEmptyPod();
      this.handleUploadResult(result);
    });
  }

  private handleUploadResult(result: SolidInitialUploadResult): void {
    switch (result.type) {
      case 'uploaded':
        this.settings.setEnabled(true);
        this.settings.setPrimaryEnabled(true);
        this.snackService.open({
          type: 'SUCCESS',
          msg: T.PS.SOLID.UPLOAD_SUCCESS,
        });
        void this.reloadFromPod();
        break;
      case 'not-authenticated':
        this.snackService.open({
          type: 'ERROR',
          msg: T.PS.SOLID.SIGN_IN_REQUIRED,
        });
        break;
      case 'remote-not-empty':
        this.snackService.open({
          type: 'ERROR',
          msg: T.PS.SOLID.REMOTE_NOT_EMPTY,
        });
        break;
      case 'invalid-state':
        this.snackService.open({
          type: 'ERROR',
          msg: T.PS.SOLID.INVALID_STATE,
          translateParams: { errorCount: result.errorCount },
        });
        break;
    }
  }

  private async runBusy(fn: () => Promise<void>): Promise<void> {
    if (this.isBusy()) {
      return;
    }

    this.isBusy.set(true);
    try {
      await fn();
    } catch (error) {
      Log.err('SolidDataLayerPanelComponent: Solid action failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      this.snackService.open({
        type: 'ERROR',
        msg: T.PS.SOLID.ACTION_FAILED,
      });
    } finally {
      this.authState.set(this.solidRuntime.client.auth.state());
      this.isBusy.set(false);
    }
  }
}
