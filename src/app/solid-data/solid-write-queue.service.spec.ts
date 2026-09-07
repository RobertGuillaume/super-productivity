import { TestBed } from '@angular/core/testing';
import { SolidWriteQueueService } from './solid-write-queue.service';

describe('SolidWriteQueueService', () => {
  it('does not start a later repository transaction before the current one settles', async () => {
    const queue = TestBed.inject(SolidWriteQueueService);
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const calls: string[] = [];

    const first = queue.enqueue(async () => {
      calls.push('first:start');
      markFirstStarted?.();
      await firstGate;
      calls.push('first:end');
    });
    const second = queue.enqueue(async () => {
      calls.push('second');
    });
    await firstStarted;

    expect(calls).toEqual(['first:start']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(calls).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues with later transactions after a rejected write', async () => {
    const queue = TestBed.inject(SolidWriteQueueService);
    const failed = queue.enqueue(async () => {
      throw new Error('write failed');
    });
    const next = queue.enqueue(async () => 'saved');

    await expectAsync(failed).toBeRejectedWithError('write failed');
    await expectAsync(next).toBeResolvedTo('saved');
  });
});
