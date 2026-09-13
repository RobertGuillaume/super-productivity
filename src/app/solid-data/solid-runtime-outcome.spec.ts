import type { RuntimeWriteOperationOutcome } from '@solid-intents/runtime';
import { classifySolidRuntimeOutcomes } from './solid-runtime-outcome';

describe('classifySolidRuntimeOutcomes', () => {
  const contentOperation = {
    kind: 'rdf.patch',
    summary: 'content',
    resourceUri: 'https://pod.example/task.ttl',
  } as const;
  const registrationOperation = {
    kind: 'type-index.register',
    summary: 'registration',
    runtimeType: 'Task',
  } as const;

  it('recognizes a confirmed mutation followed only by reconciliation failure', () => {
    expect(
      classifySolidRuntimeOutcomes([
        { operationIndex: 0, operation: contentOperation, status: 'completed' },
        {
          operationIndex: 1,
          operation: registrationOperation,
          status: 'failed',
          failure: { kind: 'reconciliation-failed', phase: 'body' },
        },
      ]),
    ).toEqual({ state: 'recoverable-success' });
  });

  it('requires authoritative refresh for conflicts and unknown dispatched outcomes', () => {
    const outcome: RuntimeWriteOperationOutcome = {
      operationIndex: 0,
      operation: contentOperation,
      status: 'unknown',
      failure: { kind: 'network-error', phase: 'dispatched' },
    };
    expect(classifySolidRuntimeOutcomes([outcome])).toEqual({
      state: 'authoritative-refresh',
    });
  });

  it('preserves the runtime retry deadline for deferred recovery', () => {
    const retryAt = new Date('2026-09-14T10:00:00.000Z');
    expect(
      classifySolidRuntimeOutcomes([
        {
          operationIndex: 0,
          operation: contentOperation,
          status: 'failed',
          failure: { kind: 'deferred', phase: 'queued', retryAt },
        },
      ]),
    ).toEqual({ state: 'deferred', retryAt });
  });
});
