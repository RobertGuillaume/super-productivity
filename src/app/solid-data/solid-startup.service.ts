import { inject, Injectable } from '@angular/core';
import type { AuthState } from '@solid-intents/runtime';
import { Log } from '../core/log';
import {
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
} from './solid-data-layer-feature-flag';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';

@Injectable({ providedIn: 'root' })
export class SolidStartupService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly sessionRecovery = inject(SolidSessionRecoveryService);

  async bootIfEnabled(): Promise<AuthState | null> {
    if (!isSolidDataLayerEnabled()) {
      return null;
    }

    const startedAt = performance.now();
    await this.solidRuntime.boot({
      restoreSession: true,
      auth: {
        clientName: 'Super Productivity',
        redirectUrl: window.location.href,
      },
    });

    const state = this.solidRuntime.client.auth.state();
    Log.normal(
      `Solid runtime boot completed in ${Math.round(performance.now() - startedAt)}ms ` +
        `with auth state: ${state.status}`,
    );
    if (state.status !== 'authenticated' && isSolidDataLayerPrimaryEnabled()) {
      this.sessionRecovery.promptForLogin();
    }
    return state;
  }
}
