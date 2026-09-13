import { inject, Injectable } from '@angular/core';
import { Log } from '../core/log';
import type { SolidAccessDecision } from './solid-access.model';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidContainerAccessService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async check(containerUri: string): Promise<SolidAccessDecision> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      return { state: 'unknown' };
    }

    try {
      const resolution =
        await this.solidRuntime.client.share.resolvePermissions(containerUri);
      if (resolution.status === 'unknown') {
        return resolution.reason === 'rate-limited'
          ? { state: 'rate-limited', retryAt: resolution.retryAt }
          : { state: 'unknown' };
      }
      const ownPermission = resolution.permissions.find(
        (permission) => permission.agent === auth.webId,
      );
      return ownPermission === undefined
        ? { state: 'unknown' }
        : { state: ownPermission.write ? 'writable' : 'read-only' };
    } catch (error) {
      Log.err('Solid container permission check failed', safeAccessError(error));
      return { state: 'unavailable' };
    }
  }
}

const safeAccessError = (error: unknown): { operation: string; errorName: string } => ({
  operation: 'check-container-access',
  errorName: error instanceof Error ? error.name : 'UnknownError',
});
