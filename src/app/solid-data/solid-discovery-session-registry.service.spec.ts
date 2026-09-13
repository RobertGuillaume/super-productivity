import { TestBed } from '@angular/core/testing';
import type {
  DiscoverySession,
  DiscoverySessionRunReason,
  DiscoverySessionSnapshot,
  RuntimeLayout,
} from '@solid-intents/runtime';
import { SolidDiscoverySessionRegistryService } from './solid-discovery-session-registry.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidDiscoverySessionRegistryService', () => {
  const layout = {
    containers: {
      tasks: 'https://pod.example/super-productivity/tasks/',
      projects: 'https://pod.example/super-productivity/projects/',
      metrics: 'https://pod.example/super-productivity/metrics/',
    },
    types: {},
  } as RuntimeLayout;
  const webId = 'https://identity.example/profile/card#me';
  let createSession: jasmine.Spy;
  let sessions: Map<string, FakeSession>;

  beforeEach(() => {
    sessions = new Map();
    createSession = jasmine.createSpy('createSession').and.callFake(async (input) => {
      const existing = sessions.get(input.id);
      if (existing !== undefined) return existing.session;
      const created = fakeSession(input.id);
      sessions.set(input.id, created);
      return created.session;
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: { client: { discovery: { createSession } } },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('creates stable scoped container sessions and a cross-origin Task session', async () => {
    await registry().initialize(layout, webId, () => undefined);

    expect(createSession.calls.argsFor(0)[0]).toEqual(
      jasmine.objectContaining({
        id: 'super-productivity-v2:container:tasks',
        targets: [{ kind: 'container', uri: layout.containers.tasks, recursive: false }],
        priority: 'foreground',
        allowedOrigins: ['https://pod.example'],
        readScope: { allowedContainerRoots: [layout.containers.tasks] },
        fallbackStorageRoots: [],
      }),
    );
    expect(createSession.calls.argsFor(2)[0].priority).toBe('background');
    expect(createSession.calls.mostRecent().args[0]).toEqual({
      id: 'super-productivity-v2:type:task',
      targets: [{ kind: 'type', type: 'Task', webId }],
      priority: 'foreground',
      fallbackStorageRoots: [],
    });
  });

  it('finishes retained work, acknowledges output, then refreshes settled sessions', async () => {
    const changed = jasmine.createSpy('changed');
    await registry().initialize(layout, webId, changed);
    const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
    taskSession.outputs.push({ receipt: 'receipt-1' });

    await registry().runStartupPass();

    expect(taskSession.run).toHaveBeenCalledTimes(2);
    expect(taskSession.run.calls.first().args[0]).toEqual(
      jasmine.objectContaining({
        signal: jasmine.any(AbortSignal),
        deadline: jasmine.any(Date),
      }),
    );
    expect(taskSession.refresh).toHaveBeenCalledTimes(1);
    expect(taskSession.acknowledgeOutput).toHaveBeenCalledOnceWith(
      'receipt-1',
      jasmine.objectContaining({ signal: jasmine.any(AbortSignal) }),
    );
    expect(changed).toHaveBeenCalled();
  });

  it('uses additional bounded turns only for exhausted or output-blocked work', async () => {
    await registry().initialize(layout, webId, () => undefined);
    const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
    taskSession.reasons = ['budget-exhausted', 'settled'];

    await registry().resume();

    expect(taskSession.run).toHaveBeenCalledTimes(2);
  });

  it('does not continue output-blocked work when acknowledgement fails', async () => {
    await registry().initialize(layout, webId, () => undefined);
    const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
    taskSession.reasons = ['output-blocked', 'settled'];
    taskSession.outputs.push({ receipt: 'receipt-1' });
    taskSession.acknowledgeOutput.and.rejectWith(new Error('output unavailable'));

    await registry().resume();

    expect(taskSession.run).toHaveBeenCalledTimes(1);
  });

  it('retries deferred and owned-elsewhere work at their runtime windows', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-09-13T10:00:00.000Z'));
    try {
      await registry().initialize(layout, webId, () => undefined);
      const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
      taskSession.nextRetryAt = new Date(Date.now() + 1_000);
      taskSession.reasons = ['retry-deferred', 'owned-elsewhere', 'settled'];

      await registry().resume();
      expect(taskSession.run).toHaveBeenCalledTimes(1);

      jasmine.clock().tick(1_000);
      await drainMicrotasks();
      expect(taskSession.run).toHaveBeenCalledTimes(2);

      jasmine.clock().tick(30_000);
      await drainMicrotasks();
      expect(taskSession.run).toHaveBeenCalledTimes(3);
    } finally {
      await registry().pause();
      jasmine.clock().uninstall();
    }
  });

  it('restores progress subscriptions after an offline pause and resume', async () => {
    await registry().initialize(layout, webId, () => undefined);
    const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
    expect(taskSession.subscribe).toHaveBeenCalledTimes(1);

    await registry().pause();
    await registry().resume();

    expect(taskSession.pause).toHaveBeenCalledTimes(1);
    expect(taskSession.unsubscribe).toHaveBeenCalledTimes(1);
    expect(taskSession.subscribe).toHaveBeenCalledTimes(2);
  });

  it('treats another tab as healthy while retaining blocked coverage as degraded', async () => {
    await registry().initialize(layout, webId, () => undefined);
    for (const fake of sessions.values()) {
      fake.reasons = ['owned-elsewhere'];
    }
    await registry().resume();
    expect(registry().isDegraded()).toBeFalse();

    const taskSession = sessions.get('super-productivity-v2:container:tasks')!;
    taskSession.reasons = ['blocked'];
    await registry().resume();
    expect(registry().isDegraded()).toBeTrue();
  });

  const registry = (): SolidDiscoverySessionRegistryService =>
    TestBed.inject(SolidDiscoverySessionRegistryService);
});

interface FakeSession {
  session: DiscoverySession;
  current: DiscoverySessionSnapshot;
  reasons: DiscoverySessionRunReason[];
  outputs: Array<{ receipt: string }>;
  nextRetryAt?: Date;
  run: jasmine.Spy;
  refresh: jasmine.Spy;
  pause: jasmine.Spy;
  subscribe: jasmine.Spy;
  unsubscribe: jasmine.Spy;
  acknowledgeOutput: jasmine.Spy;
}

const fakeSession = (id: string): FakeSession => {
  const fake = {} as FakeSession;
  fake.current = snapshot(id, 'complete', 'settled');
  fake.reasons = [];
  fake.outputs = [];
  fake.unsubscribe = jasmine.createSpy('unsubscribe');
  fake.subscribe = jasmine.createSpy('subscribe').and.callFake(() => fake.unsubscribe);
  fake.refresh = jasmine.createSpy('refresh').and.resolveTo();
  fake.pause = jasmine.createSpy('pause').and.resolveTo();
  fake.acknowledgeOutput = jasmine.createSpy('acknowledgeOutput').and.resolveTo();
  fake.run = jasmine.createSpy('run').and.callFake(async () => {
    const reason = fake.reasons.shift() ?? 'settled';
    fake.current = snapshot(
      id,
      reason === 'settled' ? 'complete' : 'partial',
      reason,
      fake.nextRetryAt,
    );
    return {
      usage: { requests: 1, bytes: 1 },
      reason,
      runs: 1,
      dispatchedJobs: 1,
      completedJobs: reason === 'settled' ? 1 : 0,
      failedJobs: 0,
      snapshot: fake.current,
    };
  });
  fake.session = {
    id,
    snapshot: () => fake.current,
    subscribe: fake.subscribe,
    run: fake.run,
    pause: fake.pause,
    cancel: jasmine.createSpy('cancel'),
    refresh: fake.refresh,
    recheckKnown: jasmine.createSpy('recheckKnown'),
    readOutput: jasmine
      .createSpy('readOutput')
      .and.callFake(async () => fake.outputs.shift() ?? null),
    acknowledgeOutput: fake.acknowledgeOutput,
  } as DiscoverySession;
  return fake;
};

const snapshot = (
  id: string,
  coverage: 'partial' | 'complete',
  stoppingReason: DiscoverySessionRunReason,
  nextRetryAt?: Date,
): DiscoverySessionSnapshot =>
  ({
    id,
    state: stoppingReason === 'blocked' ? 'blocked' : 'settled',
    generation: 1,
    priority: 'foreground',
    targets: [],
    persistence: { kind: 'indexeddb' },
    stoppingReason,
    nextRetryAt,
    resources: {
      observed: 0,
      available: 0,
      missing: 0,
      unavailable: 0,
      invalid: 0,
      failed: 0,
    },
    jobs: { pending: 0, running: 0, delayed: 0, blocked: 0, completed: 0, failed: 0 },
    expansion: { pending: 0, remainingEntries: 0 },
    coverage: { status: coverage, basis: [], exhausted: coverage === 'complete' },
    createdAt: new Date(),
    updatedAt: new Date(),
    diagnostics: [],
  }) as DiscoverySessionSnapshot;

const drainMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};
