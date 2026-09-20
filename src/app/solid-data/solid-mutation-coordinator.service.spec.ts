import { TestBed } from '@angular/core/testing';
import {
  SolidMutationCoordinator,
  SolidMutationDependencyError,
  SolidStaleMutationContextError,
  settleSolidMutations,
} from './solid-mutation-coordinator.service';
import {
  SolidMutationIntentContext,
  SolidMutationIntentRegistry,
} from './solid-mutation-intent-registry.service';

describe('SolidMutationCoordinator', () => {
  let context: SolidMutationIntentContext;

  beforeEach(() => {
    const registry = TestBed.inject(SolidMutationIntentRegistry);
    registry.activateBinding({
      runtimeGeneration: 1,
      storageRoot: 'https://pod.example/',
      webId: 'https://pod.example/profile/card#me',
    });
    context = registry.createSystemContext('test');
  });

  it('orders same-resource writes while unrelated resources overlap', async () => {
    const coordinator = TestBed.inject(SolidMutationCoordinator);
    const calls: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    let markUnrelatedStarted: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const unrelatedStarted = new Promise<void>((resolve) => {
      markUnrelatedStarted = resolve;
    });

    const first = coordinator.run('task:1', context, async () => {
      calls.push('first:start');
      markFirstStarted?.();
      await firstGate;
      calls.push('first:end');
    });
    const sameResource = coordinator.run('task:1', context, async () => {
      calls.push('same');
    });
    const unrelated = coordinator.run('task:2', context, async () => {
      calls.push('unrelated');
      markUnrelatedStarted?.();
    });
    await Promise.all([firstStarted, unrelatedStarted]);

    expect(calls).toEqual(['first:start', 'unrelated']);
    expect(coordinator.inFlightCount()).toBe(1);
    releaseFirst?.();
    await Promise.all([first, sameResource, unrelated]);
    expect(calls).toEqual(['first:start', 'unrelated', 'first:end', 'same']);
    expect(coordinator.inFlightCount()).toBe(0);
  });

  it('cancels a dependent mutation after rejected state is reconciled', async () => {
    const coordinator = TestBed.inject(SolidMutationCoordinator);
    const error = new Error('rejected write');
    let nextStarted = false;

    await expectAsync(
      coordinator.run('task:1', context, async () => {
        throw error;
      }),
    ).toBeRejectedWith(error);
    const next = coordinator.run('task:1', context, async () => {
      nextStarted = true;
    });
    await Promise.resolve();
    expect(nextStarted).toBe(false);

    coordinator.completeFailedIntent(null, error);
    await expectAsync(next).toBeRejectedWithError(SolidMutationDependencyError);
    expect(nextStarted).toBe(false);
  });

  it('waits for every sibling before surfacing a partial failure', async () => {
    let siblingFinished = false;
    const delayedSibling = Promise.resolve().then(() => {
      siblingFinished = true;
      return 'saved';
    });

    await expectAsync(
      settleSolidMutations([
        Promise.reject(new Error('failed')),
        delayedSibling,
      ] as const),
    ).toBeRejectedWithError('failed');
    expect(siblingFinished).toBe(true);
  });

  it('does not plan a queued descendant after its predecessor failed', async () => {
    const coordinator = TestBed.inject(SolidMutationCoordinator);
    const error = new Error('save failed');
    let nextStarted = false;

    await expectAsync(
      coordinator.run('task:1', context, async () => {
        throw error;
      }),
    ).toBeRejectedWith(error);

    const next = coordinator.run('task:1', context, async () => {
      nextStarted = true;
    });
    await Promise.resolve();
    expect(nextStarted).toBe(false);

    coordinator.completeFailedIntent(null, error);
    await expectAsync(next).toBeRejectedWithError(SolidMutationDependencyError);
    expect(nextStarted).toBe(false);
  });

  it('rejects old-generation work before invoking the operation', async () => {
    const coordinator = TestBed.inject(SolidMutationCoordinator);
    const registry = TestBed.inject(SolidMutationIntentRegistry);
    const staleContext = registry.createSystemContext('test');
    registry.activateBinding({
      runtimeGeneration: 2,
      storageRoot: 'https://other.example/',
      webId: 'https://other.example/profile/card#me',
    });
    const operation = jasmine.createSpy('operation').and.resolveTo(undefined);

    await expectAsync(
      coordinator.run('task:1', staleContext, operation),
    ).toBeRejectedWithError(SolidStaleMutationContextError);
    expect(operation).not.toHaveBeenCalled();
  });
});
