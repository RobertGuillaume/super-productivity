import { DestroyRef, inject, Injectable } from '@angular/core';
import type {
  DiscoverySession,
  DiscoverySessionRunReason,
  DiscoverySessionSnapshot,
  RuntimeLayout,
  Unsubscribe,
} from '@solid-intents/runtime';
import { Log } from '../core/log';
import { SolidContainerKey } from './solid-persistent-action-ownership';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { runSolidRuntimeStage } from './solid-runtime-failure';

const SESSION_PREFIX = 'super-productivity-v2';
const MULTI_TAB_LEASE_MS = 30_000;
const COORDINATOR_DEADLINE_MS = 30_000;
const FOREGROUND_CONTAINERS = new Set<SolidContainerKey>([
  'tasks',
  'projects',
  'tags',
  'app',
  'config',
]);

@Injectable({ providedIn: 'root' })
export class SolidDiscoverySessionRegistryService {
  private readonly runtime = inject(SolidRuntimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessions = new Map<string, DiscoverySession>();
  private readonly snapshots = new Map<string, DiscoverySessionSnapshot>();
  private readonly containerSessionIds = new Map<SolidContainerKey, string>();
  private readonly containerKeysByUri = new Map<string, SolidContainerKey>();
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private catalogChanged: (() => void) | null = null;
  private generation = 0;
  private runAbortController = new AbortController();

  constructor() {
    this.destroyRef.onDestroy(() => void this.pause());
  }

  async initialize(
    layout: RuntimeLayout,
    webId: string,
    catalogChanged: () => void,
  ): Promise<void> {
    await this.pause();
    this.clearLocalState();
    this.catalogChanged = catalogChanged;
    for (const [key, uri] of Object.entries(layout.containers)) {
      const containerKey = key as SolidContainerKey;
      const id = `${SESSION_PREFIX}:container:${containerKey}`;
      const session = await this.runtime.client.discovery.createSession({
        id,
        targets: [{ kind: 'container', uri, recursive: false }],
        priority: FOREGROUND_CONTAINERS.has(containerKey) ? 'foreground' : 'background',
        allowedOrigins: [new URL(uri).origin],
        readScope: { allowedContainerRoots: [uri] },
        fallbackStorageRoots: [],
      });
      this.containerSessionIds.set(containerKey, id);
      this.containerKeysByUri.set(normalizeContainerUri(uri), containerKey);
      this.addSession(session);
    }
    const nativeTaskSession = await this.runtime.client.discovery.createSession({
      id: this.nativeTaskSessionId,
      targets: [{ kind: 'type', type: SOLID_PRODUCTIVITY_TASK_TYPE, webId }],
      priority: 'foreground',
      fallbackStorageRoots: [],
    });
    this.addSession(nativeTaskSession);
    this.activateSubscriptions();
  }

  async runStartupPass(): Promise<void> {
    const settled = [...this.sessions.values()].filter(
      (session) => session.snapshot().state === 'settled',
    );
    await runSolidRuntimeStage('discovery-retained-run', () => this.runRounds());
    await runSolidRuntimeStage('discovery-fresh-prepare', () =>
      this.refreshSessions(settled),
    );
    await runSolidRuntimeStage('discovery-fresh-run', () => this.runRounds());
  }

  async refreshAndRun(): Promise<void> {
    await runSolidRuntimeStage('discovery-manual-prepare', () =>
      this.refreshSessions(this.sessions.values()),
    );
    await runSolidRuntimeStage('discovery-manual-run', () => this.runRounds());
  }

  async resume(): Promise<void> {
    this.activateSubscriptions();
    await this.runRounds();
  }

  coverage(containerKey: SolidContainerKey): 'unknown' | 'partial' | 'complete' {
    const container =
      this.snapshotForContainer(containerKey)?.coverage.status ?? 'unknown';
    if (containerKey !== 'tasks' || container !== 'complete') {
      return container;
    }
    return this.snapshots.get(this.nativeTaskSessionId)?.coverage.status ?? 'unknown';
  }

  containerCoverage(containerKey: SolidContainerKey): 'unknown' | 'partial' | 'complete' {
    return this.snapshotForContainer(containerKey)?.coverage.status ?? 'unknown';
  }

  coverageForContainerUri(uri: string): 'unknown' | 'partial' | 'complete' {
    const key = this.containerKeysByUri.get(normalizeContainerUri(uri));
    return key === undefined ? 'unknown' : this.coverage(key);
  }

  isDegraded(): boolean {
    return [...this.snapshots.values()].some(
      (snapshot) =>
        snapshot.stoppingReason !== 'owned-elsewhere' &&
        (snapshot.state === 'blocked' || snapshot.coverage.status !== 'complete'),
    );
  }

  async pause(): Promise<void> {
    this.generation++;
    this.runAbortController.abort();
    this.clearRetryTimers();
    await Promise.allSettled(
      [...this.sessions.values()].map((session) => session.pause()),
    );
    this.stopSubscriptions();
  }

  private addSession(session: DiscoverySession): void {
    this.sessions.set(session.id, session);
    this.snapshots.set(session.id, session.snapshot());
  }

  private activateSubscriptions(): void {
    this.stopSubscriptions();
    this.runAbortController.abort();
    this.runAbortController = new AbortController();
    const generation = ++this.generation;
    for (const session of this.sessions.values()) {
      this.subscriptions.push(
        session.subscribe((snapshot) => {
          if (generation !== this.generation) return;
          this.snapshots.set(session.id, snapshot);
        }),
      );
    }
  }

  private async runRounds(): Promise<void> {
    let active = [...this.sessions.values()];
    const terminalFailures: unknown[] = [];
    while (active.length > 0) {
      const signal = this.runAbortController.signal;
      const results = await Promise.allSettled(
        active.map((session) =>
          session.run({
            signal,
            deadline: new Date(Date.now() + COORDINATOR_DEADLINE_MS),
          }),
        ),
      );
      const continueIds = new Set<string>();
      for (let index = 0; index < results.length; index++) {
        const session = active[index];
        const result = results[index];
        const outputDrained = await this.tryDrainOutput(session, signal);
        if (result.status === 'rejected') {
          this.snapshots.set(session.id, session.snapshot());
          if (!signal.aborted) {
            this.logSessionFailure(result.reason);
            terminalFailures.push(result.reason);
          }
          continue;
        }
        this.snapshots.set(session.id, result.value.snapshot);
        if (
          result.value.reason === 'budget-exhausted' ||
          (result.value.reason === 'output-blocked' && outputDrained)
        ) {
          continueIds.add(session.id);
        } else {
          this.handleTerminalReason(session, result.value.reason, result.value.snapshot);
        }
      }
      this.catalogChanged?.();
      active = active.filter((session) => continueIds.has(session.id));
      if (active.length > 0) {
        await yieldToBrowser();
      }
    }
    if (terminalFailures.length > 0) {
      throw terminalFailures[0];
    }
  }

  private async refreshSessions(sessions: Iterable<DiscoverySession>): Promise<void> {
    for (const session of sessions) {
      await session.refresh();
    }
  }

  private async tryDrainOutput(
    session: DiscoverySession,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      let outputAcknowledged = false;
      let output = await session.readOutput({
        signal,
        deadline: new Date(Date.now() + 10_000),
      });
      while (output !== null) {
        await session.acknowledgeOutput(output.receipt, {
          signal,
          deadline: new Date(Date.now() + 10_000),
        });
        outputAcknowledged = true;
        output = await session.readOutput({
          signal,
          deadline: new Date(Date.now() + 10_000),
        });
      }
      return outputAcknowledged;
    } catch (error) {
      if (!signal.aborted) this.logSessionFailure(error, 'discovery-output-drain');
      return false;
    }
  }

  private handleTerminalReason(
    session: DiscoverySession,
    reason: DiscoverySessionRunReason,
    snapshot: DiscoverySessionSnapshot,
  ): void {
    if (reason === 'retry-deferred' && snapshot.nextRetryAt !== undefined) {
      this.scheduleRetry(session, snapshot.nextRetryAt.getTime());
    } else if (reason === 'owned-elsewhere') {
      this.scheduleRetry(session, Date.now() + MULTI_TAB_LEASE_MS);
    }
  }

  private scheduleRetry(session: DiscoverySession, retryAt: number): void {
    const previous = this.retryTimers.get(session.id);
    if (previous !== undefined) clearTimeout(previous);
    const generation = this.generation;
    this.retryTimers.set(
      session.id,
      setTimeout(
        () => {
          this.retryTimers.delete(session.id);
          if (generation === this.generation && navigator.onLine) {
            void this.runSingleSession(session).catch((error) => {
              if (!this.runAbortController.signal.aborted) {
                this.logSessionFailure(error);
              }
            });
          }
        },
        Math.max(0, retryAt - Date.now()),
      ),
    );
  }

  private async runSingleSession(session: DiscoverySession): Promise<void> {
    const signal = this.runAbortController.signal;
    let result = await session.run({
      signal,
      deadline: new Date(Date.now() + COORDINATOR_DEADLINE_MS),
    });
    let outputDrained = await this.tryDrainOutput(session, signal);
    while (result.reason === 'budget-exhausted' || result.reason === 'output-blocked') {
      if (result.reason === 'output-blocked' && !outputDrained) break;
      await yieldToBrowser();
      result = await session.run({
        signal,
        deadline: new Date(Date.now() + COORDINATOR_DEADLINE_MS),
      });
      outputDrained = await this.tryDrainOutput(session, signal);
    }
    this.snapshots.set(session.id, result.snapshot);
    this.handleTerminalReason(session, result.reason, result.snapshot);
    this.catalogChanged?.();
  }

  private snapshotForContainer(
    containerKey: SolidContainerKey,
  ): DiscoverySessionSnapshot | undefined {
    const id = this.containerSessionIds.get(containerKey);
    return id === undefined ? undefined : this.snapshots.get(id);
  }

  private get nativeTaskSessionId(): string {
    return `${SESSION_PREFIX}:type:task`;
  }

  private clearLocalState(): void {
    this.sessions.clear();
    this.snapshots.clear();
    this.containerSessionIds.clear();
    this.containerKeysByUri.clear();
    this.clearRetryTimers();
  }

  private stopSubscriptions(): void {
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
  }

  private clearRetryTimers(): void {
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }

  private logSessionFailure(error: unknown, operation = 'discovery-session-run'): void {
    Log.err('Solid discovery session failed', {
      operation,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const normalizeContainerUri = (uri: string): string =>
  uri.endsWith('/') ? uri : `${uri}/`;
