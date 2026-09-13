import type { RuntimeWriteOperationOutcome } from '@solid-intents/runtime';

export interface SolidRuntimeOutcomeClassification {
  state: 'confirmed' | 'recoverable-success' | 'authoritative-refresh' | 'deferred';
  retryAt?: Date;
}

/** Classifies runtime outcomes without guessing from exception message text. */
export const classifySolidRuntimeOutcomes = (
  outcomes: readonly RuntimeWriteOperationOutcome[],
): SolidRuntimeOutcomeClassification => {
  const failed = outcomes.filter(
    (outcome) => outcome.status === 'failed' || outcome.status === 'unknown',
  );
  if (failed.length === 0) {
    return { state: 'confirmed' };
  }
  const retryAt = failed
    .map((outcome) => outcome.failure?.retryAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (
    failed.some(
      (outcome) =>
        outcome.failure?.kind === 'deferred' || outcome.failure?.httpStatus === 429,
    )
  ) {
    return { state: 'deferred', retryAt };
  }
  const mutationCompleted = outcomes.some(
    (outcome) =>
      (outcome.status === 'completed' || outcome.status === 'already-satisfied') &&
      outcome.operation.kind !== 'type-index.register',
  );
  const onlyReconciliationFailed = failed.every(
    (outcome) =>
      outcome.failure?.kind === 'reconciliation-failed' ||
      outcome.operation.kind === 'type-index.register',
  );
  return mutationCompleted && onlyReconciliationFailed
    ? { state: 'recoverable-success' }
    : { state: 'authoritative-refresh' };
};

export const outcomesFromError = (
  error: unknown,
): readonly RuntimeWriteOperationOutcome[] => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'outcomes' in error &&
    Array.isArray(error.outcomes)
  ) {
    return error.outcomes as readonly RuntimeWriteOperationOutcome[];
  }
  return [];
};
