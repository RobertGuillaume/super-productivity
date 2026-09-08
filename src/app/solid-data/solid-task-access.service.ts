import { inject, Injectable, signal } from '@angular/core';
import type { Thing } from '@solid-intents/runtime';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidRuntimeService } from './solid-runtime.service';
import type { SolidAccessDecision, SolidAccessState } from './solid-access.model';

const ACCESS_CHECK_BATCH_SIZE = 2;

export type SolidTaskOrigin = 'app' | 'external';

export interface SolidTaskCapability {
  taskId: string;
  thingUri: string;
  sourceUri: string;
  origin: SolidTaskOrigin;
  access: SolidAccessState;
  retryAt?: Date;
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
      retryAt:
        current?.origin === 'external' && current.sourceUri === sourceUri
          ? current.retryAt
          : undefined,
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

  accessDecision(taskId: string): SolidAccessDecision | null {
    const capability = this.capabilitiesSignal().get(taskId);
    if (capability?.origin !== 'external') {
      return null;
    }
    return capability.retryAt === undefined
      ? { state: capability.access }
      : { state: capability.access, retryAt: capability.retryAt };
  }

  isMutationBlocked(taskId: string): boolean {
    const decision = this.accessDecision(taskId);
    return decision !== null && decision.state !== 'writable';
  }

  isReadOnly(taskId: string): boolean {
    return this.accessDecision(taskId)?.state === 'read-only';
  }

  isAppOwned(taskId: string): boolean {
    return this.capabilitiesSignal().get(taskId)?.origin === 'app';
  }

  canMutateTasks(taskIds: readonly string[]): boolean {
    return taskIds.every((taskId) => !this.isMutationBlocked(taskId));
  }

  hasBlockedExternalTask(): boolean {
    return Array.from(this.capabilitiesSignal().values()).some(
      (capability) =>
        capability.origin === 'external' && capability.access !== 'writable',
    );
  }

  async refreshExternalPermissions(options?: { unknownOnly?: boolean }): Promise<void> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      this.markExternalTasks('unknown');
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
    const decision = await this.containerAccess.check(sourceUri);
    this.setSourceDecision(sourceUri, decision);
  }

  private setSourceDecision(sourceUri: string, decision: SolidAccessDecision): void {
    this.capabilitiesSignal.update((capabilities) => {
      let changed = false;
      const next = new Map(capabilities);
      for (const [taskId, capability] of capabilities) {
        if (
          capability.origin === 'external' &&
          capability.sourceUri === sourceUri &&
          (capability.access !== decision.state ||
            capability.retryAt?.getTime() !== decision.retryAt?.getTime())
        ) {
          next.set(taskId, {
            ...capability,
            access: decision.state,
            retryAt: decision.retryAt,
          });
          changed = true;
        }
      }
      return changed ? next : capabilities;
    });
  }

  private markExternalTasks(access: SolidAccessState): void {
    this.capabilitiesSignal.update((capabilities) => {
      let changed = false;
      const next = new Map(capabilities);
      for (const [taskId, capability] of capabilities) {
        if (capability.origin === 'external' && capability.access !== access) {
          next.set(taskId, { ...capability, access, retryAt: undefined });
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
  left.access === right.access &&
  left.retryAt?.getTime() === right.retryAt?.getTime();

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
