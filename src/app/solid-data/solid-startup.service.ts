import { inject, Injectable } from '@angular/core';
import type { AuthState } from '@solid-intents/runtime';
import { Log } from '../core/log';
import { isSolidDataLayerEnabled } from './solid-data-layer-feature-flag';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidStartupService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async bootIfEnabled(): Promise<AuthState | null> {
    if (!isSolidDataLayerEnabled()) {
      return null;
    }

    await this.solidRuntime.boot({
      restoreSession: true,
      auth: {
        clientName: 'Super Productivity',
        redirectUrl: window.location.href,
      },
    });

    const state = this.solidRuntime.client.auth.state();
    Log.normal(`Solid data layer booted with auth state: ${state.status}`);
    return state;
  }
}
