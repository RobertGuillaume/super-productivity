import { inject, Injectable } from '@angular/core';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { SolidDataLayerSettingsService } from './solid-data-layer-settings.service';
import { SolidRuntimeService } from './solid-runtime.service';

const SESSION_EXPIRED_MESSAGE = 'Authentication session expired';

@Injectable({ providedIn: 'root' })
export class SolidSessionRecoveryService {
  private readonly settings = inject(SolidDataLayerSettingsService);
  private readonly snackService = inject(SnackService);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private isLoginPromptOpen = false;
  private authRefreshInFlight: Promise<void> | null = null;

  handleAuthenticationError(error: unknown): boolean {
    if (!isSolidAuthenticationError(error)) {
      return false;
    }

    this.promptForLogin();
    this.refreshRuntimeAuthState();
    return true;
  }

  promptForLogin(): void {
    if (this.isLoginPromptOpen) {
      return;
    }

    this.isLoginPromptOpen = true;
    this.snackService.open({
      type: 'ERROR',
      msg: T.PS.SOLID.SESSION_EXPIRED,
      actionStr: T.PS.SOLID.LOGIN_AGAIN,
      actionFn: (): void => {
        this.isLoginPromptOpen = false;
        void this.loginAgain();
      },
      config: { duration: 0 },
    });
  }

  private refreshRuntimeAuthState(): void {
    if (this.authRefreshInFlight !== null) {
      return;
    }

    this.authRefreshInFlight = this.restoreRuntimeAuthState().finally(() => {
      this.authRefreshInFlight = null;
    });
  }

  private async restoreRuntimeAuthState(): Promise<void> {
    try {
      await this.solidRuntime.restoreSession();
    } catch (error) {
      Log.err('SolidSessionRecoveryService: failed to refresh auth state', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private async loginAgain(): Promise<void> {
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
      Log.err('SolidSessionRecoveryService: login failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      this.promptForLogin();
    }
  }
}

export const isSolidAuthenticationError = (error: unknown): boolean => {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (typeof current !== 'object' || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    const errorLike = current as {
      cause?: unknown;
      details?: unknown;
      httpStatus?: unknown;
      message?: unknown;
      outcomes?: unknown;
      response?: unknown;
      responseStatus?: unknown;
      status?: unknown;
    };
    if (
      errorLike.message === SESSION_EXPIRED_MESSAGE ||
      errorLike.status === 401 ||
      errorLike.responseStatus === 401 ||
      errorLike.httpStatus === 401
    ) {
      return true;
    }

    pending.push(
      errorLike.cause,
      errorLike.details,
      errorLike.outcomes,
      errorLike.response,
    );
  }

  return false;
};
