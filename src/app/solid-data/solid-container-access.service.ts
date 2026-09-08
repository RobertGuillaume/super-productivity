import { inject, Injectable } from '@angular/core';
import { Log } from '../core/log';
import { SolidWriteReadiness } from './solid-data-layer-state.service';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidContainerAccessService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async check(containerUri: string): Promise<SolidWriteReadiness> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      return 'read-only';
    }

    let response: Response;
    try {
      response = await this.solidRuntime.client.auth.fetch()(containerUri, {
        method: 'HEAD',
      });
    } catch (error) {
      Log.err('Solid container access check unavailable', safeAccessError(error));
      return 'unavailable';
    }

    if (!response.ok) {
      return response.status === 401 || response.status === 403
        ? 'read-only'
        : 'unavailable';
    }

    const headerAccess = accessFromWacAllow(response.headers.get('WAC-Allow'));
    if (headerAccess !== null) {
      return headerAccess;
    }

    try {
      const permissions = await this.solidRuntime.client.share.permissions(containerUri);
      return permissions.some(
        (permission) => permission.agent === auth.webId && permission.write === true,
      )
        ? 'writable'
        : 'read-only';
    } catch (error) {
      Log.err('Solid container permission check failed', safeAccessError(error));
      return 'read-only';
    }
  }
}

export const accessFromWacAllow = (
  header: string | null,
): 'writable' | 'read-only' | null => {
  if (header === null) {
    return null;
  }
  const userMatch = /(?:^|,)\s*user\s*=\s*"([^"]*)"/i.exec(header);
  if (userMatch === null) {
    return null;
  }
  const permissions = userMatch[1]
    .split(/[\s,]+/)
    .map((permission) => permission.trim().toLowerCase())
    .filter(Boolean);
  return permissions.includes('write') ? 'writable' : 'read-only';
};

const safeAccessError = (error: unknown): { operation: string; errorName: string } => ({
  operation: 'check-container-access',
  errorName: error instanceof Error ? error.name : 'UnknownError',
});
