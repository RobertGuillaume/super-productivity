import { inject, Injectable, signal } from '@angular/core';
import type { Thing } from '@solid-intents/runtime';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidRuntimeService } from './solid-runtime.service';

const ACCESS_CHECK_BATCH_SIZE = 2;

export type SolidTaskAccess = 'writable' | 'read-only' | 'unknown';
export type SolidTaskOrigin = 'app' | 'external';

export interface SolidTaskCapability {
  taskId: string;
  thingUri: string;
  sourceUri: string;
  origin: SolidTaskOrigin;
  access: SolidTaskAccess;
}

/** Transient access data for app-owned tasks and VTODOs discovered elsewhere. */
@Injectable({ providedIn: 'root' })
export class SolidTaskAccessService {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly containerAccess = inject(SolidContainerAccessService);
  private readonly capabilitiesSignal = signal<ReadonlyMap<string, SolidTaskCapability>>(
    new Map(),
  );
  private readonly pendingPermissionChecks = new Map<string, Promise<void>>();

  readonly capabilities = this.capabilitiesSignal.asReadonly();

  registerThing(taskId: string, thing: Thing): void {
    const sourceUri = thing.source.uri;
    const taskContainerUri = this.solidRuntime.taskProfile.target?.containerUri;
    const origin =
      taskContainerUri !== undefined && isWithinContainer(sourceUri, taskContainerUri)
        ? 'app'
        : 'external';
    const current = this.capabilitiesSignal().get(taskId);
    const access =
      origin === 'app'
        ? 'unknown'
        : current?.origin === 'external' && current.sourceUri === sourceUri
          ? current.access
          : 'unknown';
    const capability: SolidTaskCapability = {
      taskId,
      thingUri: thing.uri,
      sourceUri,
      origin,
      access,
    };

    if (capabilitiesEqual(current, capability)) {
      return;
    }
    this.capabilitiesSignal.update((capabilities) => {
      const next = new Map(capabilities);
      next.set(taskId, capability);
      return next;
    });
  }

  clear(): void {
    this.capabilitiesSignal.set(new Map());
    this.pendingPermissionChecks.clear();
  }

  isReadOnly(taskId: string): boolean {
    const capability = this.capabilitiesSignal().get(taskId);
    return capability?.origin === 'external' && capability.access !== 'writable';
  }

  isAppOwned(taskId: string): boolean {
    return this.capabilitiesSignal().get(taskId)?.origin === 'app';
  }

  canMutateTasks(taskIds: readonly string[]): boolean {
    return taskIds.every((taskId) => !this.isReadOnly(taskId));
  }

  hasReadOnlyExternalTask(): boolean {
    return Array.from(this.capabilitiesSignal().values()).some(
      (capability) =>
        capability.origin === 'external' && capability.access !== 'writable',
    );
  }

  async refreshExternalPermissions(options?: { unknownOnly?: boolean }): Promise<void> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      this.markExternalTasksReadOnly();
      return;
    }

    const sourceUris = Array.from(
      new Set(
        Array.from(this.capabilitiesSignal().values())
          .filter(
            (capability) =>
              capability.origin === 'external' &&
              (!options?.unknownOnly || capability.access === 'unknown'),
          )
          .map((capability) => capability.sourceUri),
      ),
    );
    for (let index = 0; index < sourceUris.length; index += ACCESS_CHECK_BATCH_SIZE) {
      await Promise.allSettled(
        sourceUris
          .slice(index, index + ACCESS_CHECK_BATCH_SIZE)
          .map((sourceUri) => this.refreshSourcePermission(sourceUri)),
      );
    }
  }

  private refreshSourcePermission(sourceUri: string): Promise<void> {
    const pending = this.pendingPermissionChecks.get(sourceUri);
    if (pending !== undefined) {
      return pending;
    }

    const check = this.readSourcePermission(sourceUri).finally(() => {
      this.pendingPermissionChecks.delete(sourceUri);
    });
    this.pendingPermissionChecks.set(sourceUri, check);
    return check;
  }

  private async readSourcePermission(sourceUri: string): Promise<void> {
    const readiness = await this.containerAccess.check(sourceUri);
    this.setSourceAccess(sourceUri, readiness === 'writable' ? 'writable' : 'read-only');
  }

  private setSourceAccess(sourceUri: string, access: SolidTaskAccess): void {
    this.capabilitiesSignal.update((capabilities) => {
      let changed = false;
      const next = new Map(capabilities);
      for (const [taskId, capability] of capabilities) {
        if (
          capability.origin === 'external' &&
          capability.sourceUri === sourceUri &&
          capability.access !== access
        ) {
          next.set(taskId, { ...capability, access });
          changed = true;
        }
      }
      return changed ? next : capabilities;
    });
  }

  private markExternalTasksReadOnly(): void {
    this.capabilitiesSignal.update((capabilities) => {
      let changed = false;
      const next = new Map(capabilities);
      for (const [taskId, capability] of capabilities) {
        if (capability.origin === 'external' && capability.access !== 'read-only') {
          next.set(taskId, { ...capability, access: 'read-only' });
          changed = true;
        }
      }
      return changed ? next : capabilities;
    });
  }
}

const capabilitiesEqual = (
  left: SolidTaskCapability | undefined,
  right: SolidTaskCapability,
): boolean =>
  left?.thingUri === right.thingUri &&
  left.sourceUri === right.sourceUri &&
  left.origin === right.origin &&
  left.access === right.access;

const isWithinContainer = (resourceUri: string, containerUri: string): boolean => {
  try {
    const resource = new URL(resourceUri);
    const container = new URL(containerUri);
    const containerPath = container.pathname.endsWith('/')
      ? container.pathname
      : `${container.pathname}/`;
    return (
      resource.origin === container.origin && resource.pathname.startsWith(containerPath)
    );
  } catch {
    return false;
  }
};
