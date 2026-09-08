import { DestroyRef, inject, Injectable, signal } from '@angular/core';
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly containerAccess = inject(SolidContainerAccessService);
  private readonly capabilitiesSignal = signal<ReadonlyMap<string, SolidTaskCapability>>(
    new Map(),
  );
  private readonly pendingPermissionChecks = new Map<string, Promise<void>>();
  private readonly knownSourceUris = new Set<string>();
  private readonly attemptedSourceUris = new Set<string>();
  private readonly queuedSourceUris = new Set<string>();
  private readonly prioritySourceUris = new Set<string>();
  private readonly permissionQueue: string[] = [];
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly scheduledRetryAt = new Map<string, number>();
  private permissionWorkerPromise: Promise<void> | null = null;
  private backgroundChecksEnabled = false;
  private isDestroyed = false;

  readonly capabilities = this.capabilitiesSignal.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.clearRetryTimers();
    });
  }

  registerThing(taskId: string, thing: Thing): void {
    const sourceUri = thing.source.uri;
    const taskContainerUri = this.solidRuntime.taskProfile.target?.containerUri;
    const origin =
      taskContainerUri !== undefined && isWithinContainer(sourceUri, taskContainerUri)
        ? 'app'
        : 'external';
    const current = this.capabilitiesSignal().get(taskId);
    const isNewExternalSource =
      origin === 'external' && !this.knownSourceUris.has(sourceUri);
    if (origin === 'external') {
      this.knownSourceUris.add(sourceUri);
    }
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
    if (isNewExternalSource && this.backgroundChecksEnabled) {
      this.enqueueSource(sourceUri);
      void this.ensurePermissionWorkers();
    }
  }

  clear(): void {
    this.capabilitiesSignal.set(new Map());
    this.pendingPermissionChecks.clear();
    this.knownSourceUris.clear();
    this.attemptedSourceUris.clear();
    this.queuedSourceUris.clear();
    this.prioritySourceUris.clear();
    this.permissionQueue.length = 0;
    this.backgroundChecksEnabled = false;
    this.clearRetryTimers();
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

  scheduleExternalPermissionChecks(options?: { force?: boolean }): Promise<void> {
    this.backgroundChecksEnabled = true;
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      this.markExternalTasks('unknown');
      return Promise.resolve();
    }

    const sourceUris = new Set(
      Array.from(this.capabilitiesSignal().values())
        .filter((capability) => capability.origin === 'external')
        .map((capability) => capability.sourceUri),
    );
    for (const sourceUri of sourceUris) {
      if (options?.force) {
        this.cancelRetry(sourceUri);
        this.scheduledRetryAt.delete(sourceUri);
        this.attemptedSourceUris.delete(sourceUri);
      }
      this.enqueueSource(sourceUri);
    }
    return this.ensurePermissionWorkers();
  }

  /** Compatibility entry point for callers that need to await the background pass. */
  refreshExternalPermissions(options?: { unknownOnly?: boolean }): Promise<void> {
    return this.scheduleExternalPermissionChecks({ force: !options?.unknownOnly });
  }

  prioritizeTask(taskId: string): void {
    const capability = this.capabilitiesSignal().get(taskId);
    if (capability?.origin !== 'external') {
      return;
    }
    const retryAt = capability.retryAt?.getTime();
    if (retryAt !== undefined && retryAt > Date.now()) {
      this.prioritySourceUris.add(capability.sourceUri);
      return;
    }
    if (capability.access === 'writable' || capability.access === 'read-only') {
      return;
    }
    this.prioritySourceUris.add(capability.sourceUri);
    this.attemptedSourceUris.delete(capability.sourceUri);
    if (this.backgroundChecksEnabled) {
      this.enqueueSource(capability.sourceUri);
      void this.ensurePermissionWorkers();
    }
  }

  private enqueueSource(sourceUri: string): void {
    if (
      this.isDestroyed ||
      this.attemptedSourceUris.has(sourceUri) ||
      this.queuedSourceUris.has(sourceUri) ||
      this.pendingPermissionChecks.has(sourceUri)
    ) {
      return;
    }
    this.queuedSourceUris.add(sourceUri);
    this.permissionQueue.push(sourceUri);
  }

  private ensurePermissionWorkers(): Promise<void> {
    if (this.permissionWorkerPromise !== null) {
      return this.permissionWorkerPromise;
    }
    if (this.permissionQueue.length === 0) {
      return Promise.resolve();
    }

    const workers = Promise.all(
      Array.from({ length: ACCESS_CHECK_BATCH_SIZE }, () => this.runPermissionWorker()),
    ).then(() => undefined);
    const tracked = workers.finally(() => {
      if (this.permissionWorkerPromise === tracked) {
        this.permissionWorkerPromise = null;
      }
      if (this.permissionQueue.length > 0 && !this.isDestroyed) {
        void this.ensurePermissionWorkers();
      }
    });
    this.permissionWorkerPromise = tracked;
    return tracked;
  }

  private async runPermissionWorker(): Promise<void> {
    while (!this.isDestroyed) {
      const sourceUri = this.takeNextSource();
      if (sourceUri === undefined) {
        return;
      }
      this.queuedSourceUris.delete(sourceUri);
      if (!this.sourceIsRegistered(sourceUri)) {
        continue;
      }
      this.attemptedSourceUris.add(sourceUri);
      this.setSourceDecision(sourceUri, { state: 'checking' });
      await this.refreshSourcePermission(sourceUri);
    }
  }

  private takeNextSource(): string | undefined {
    const priorityIndex = this.permissionQueue.findIndex((sourceUri) =>
      this.prioritySourceUris.has(sourceUri),
    );
    const index = priorityIndex >= 0 ? priorityIndex : 0;
    const [sourceUri] = this.permissionQueue.splice(index, 1);
    if (sourceUri !== undefined) {
      this.prioritySourceUris.delete(sourceUri);
    }
    return sourceUri;
  }

  private sourceIsRegistered(sourceUri: string): boolean {
    return Array.from(this.capabilitiesSignal().values()).some(
      (capability) =>
        capability.origin === 'external' && capability.sourceUri === sourceUri,
    );
  }

  private refreshSourcePermission(sourceUri: string): Promise<void> {
    const pending = this.pendingPermissionChecks.get(sourceUri);
    if (pending !== undefined) {
      return pending;
    }

    const check = this.readSourcePermission(sourceUri).finally(() => {
      if (this.pendingPermissionChecks.get(sourceUri) === check) {
        this.pendingPermissionChecks.delete(sourceUri);
      }
    });
    this.pendingPermissionChecks.set(sourceUri, check);
    return check;
  }

  private async readSourcePermission(sourceUri: string): Promise<void> {
    try {
      const decision = await this.containerAccess.check(sourceUri);
      this.setSourceDecision(sourceUri, decision);
      if (decision.state === 'rate-limited') {
        this.scheduleRetry(sourceUri, decision.retryAt);
      }
    } catch {
      this.setSourceDecision(sourceUri, { state: 'unavailable' });
    }
  }

  private scheduleRetry(sourceUri: string, retryAt: Date | undefined): void {
    if (retryAt === undefined) {
      return;
    }
    const retryAtMs = retryAt.getTime();
    if (
      !Number.isFinite(retryAtMs) ||
      this.scheduledRetryAt.get(sourceUri) === retryAtMs
    ) {
      return;
    }
    this.cancelRetry(sourceUri);
    this.scheduledRetryAt.set(sourceUri, retryAtMs);
    const timer = setTimeout(
      () => {
        this.retryTimers.delete(sourceUri);
        if (this.isDestroyed || !this.sourceIsRegistered(sourceUri)) {
          return;
        }
        this.attemptedSourceUris.delete(sourceUri);
        this.enqueueSource(sourceUri);
        void this.ensurePermissionWorkers();
      },
      Math.max(0, retryAtMs - Date.now()),
    );
    this.retryTimers.set(sourceUri, timer);
  }

  private cancelRetry(sourceUri: string): void {
    const timer = this.retryTimers.get(sourceUri);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.retryTimers.delete(sourceUri);
    }
  }

  private clearRetryTimers(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.scheduledRetryAt.clear();
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
