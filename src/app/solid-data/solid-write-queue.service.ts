import { Injectable } from '@angular/core';

/**
 * Serializes complete Solid repository transactions, including their lookup phase.
 *
 * The runtime serializes authenticated HTTP requests, but that alone does not prevent
 * two repository calls from both observing a missing Thing before either creates it,
 * or from committing write plans based on stale catalog state.
 */
@Injectable({ providedIn: 'root' })
export class SolidWriteQueueService {
  private tail: Promise<void> = Promise.resolve();

  enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const current = this.tail.catch(() => undefined).then(operation);
    this.tail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }
}
