import { TestBed } from '@angular/core/testing';
import {
  SolidMutationCoordinator,
  settleSolidMutations,
} from './solid-mutation-coordinator.service';

describe('SolidMutationCoordinator', () => {
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

    const first = coordinator.run('task:1', async () => {
      calls.push('first:start');
      markFirstStarted?.();
      await firstGate;
      calls.push('first:end');
    });
    const sameResource = coordinator.run('task:1', async () => {
      calls.push('same');
    });
    const unrelated = coordinator.run('task:2', async () => {
      calls.push('unrelated');
      markUnrelatedStarted?.();
    });
    expect(coordinator.inFlightCount()).toBe(3);
    await Promise.all([firstStarted, unrelatedStarted]);

    expect(calls).toEqual(['first:start', 'unrelated']);
    expect(coordinator.inFlightCount()).toBe(2);
    releaseFirst?.();
    await Promise.all([first, sameResource, unrelated]);
    expect(calls).toEqual(['first:start', 'unrelated', 'first:end', 'same']);
    expect(coordinator.inFlightCount()).toBe(0);
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
});
