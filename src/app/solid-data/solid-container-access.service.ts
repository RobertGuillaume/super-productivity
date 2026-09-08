import { inject, Injectable } from '@angular/core';
import { Log } from '../core/log';
import type { SolidAccessDecision, SolidAccessState } from './solid-access.model';
import { SolidRuntimeService } from './solid-runtime.service';

@Injectable({ providedIn: 'root' })
export class SolidContainerAccessService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async check(containerUri: string): Promise<SolidAccessDecision> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      return { state: 'unknown' };
    }

    let response: Response;
    try {
      response = await this.solidRuntime.client.auth.fetch()(containerUri, {
        method: 'HEAD',
      });
    } catch (error) {
      Log.err('Solid container access check unavailable', safeAccessError(error));
      return { state: 'unavailable' };
    }

    if (!response.ok) {
      if (response.status === 429) {
        return {
          state: 'rate-limited',
          retryAt: this.retryAtFor(containerUri),
        };
      }
      return {
        state:
          response.status === 401 || response.status === 403
            ? 'read-only'
            : 'unavailable',
      };
    }

    const headerAccess = accessFromWacAllow(response.headers.get('WAC-Allow'));
    if (headerAccess !== null) {
      return { state: headerAccess };
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
      return { state: 'unknown' };
    }
  }

  private retryAtFor(containerUri: string): Date | undefined {
    let origin: string;
    try {
      origin = new URL(containerUri).origin;
    } catch {
      return undefined;
    }
    return (
      this.solidRuntime.client.diagnostics
        .status()
        .requestScheduling.find((status) => status.origin === origin)?.cooldownUntil ??
      undefined
    );
  }
}

export const accessFromWacAllow = (
  header: string | null,
): Extract<SolidAccessState, 'writable' | 'read-only'> | null => {
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
