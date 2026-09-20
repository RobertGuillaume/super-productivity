import { EMPTY, from, Observable } from 'rxjs';
import { catchError, finalize, ignoreElements, tap } from 'rxjs/operators';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { classifySolidRuntimeOutcomes, outcomesFromError } from './solid-runtime-outcome';
import { SolidMutationIntentContext } from './solid-mutation-intent-registry.service';

interface SolidAuthenticationErrorHandler {
  handleAuthenticationError?(error: unknown): boolean;
  mutationContextFor?(action: object): SolidMutationIntentContext | null;
  recoverRejectedMutation?(
    context: SolidMutationIntentContext | null,
    error: unknown,
    source: string,
  ): Promise<void> | void;
  demoteWriteAccessAfterFailure?(
    error: unknown,
    context: SolidMutationIntentContext | null,
  ): void;
}

const noticedRecoveries = new Set<Promise<void>>();

export const handleSolidPersistenceError = ({
  error,
  snackService,
  sessionRecovery,
  source,
  action,
}: {
  error: unknown;
  snackService: SnackService;
  sessionRecovery?: SolidAuthenticationErrorHandler;
  source: string;
  action?: object;
}): Observable<never> => {
  const fields = structuredErrorFields(error, source);
  Log.err(source, {
    ...fields,
  });
  const context = action ? (sessionRecovery?.mutationContextFor?.(action) ?? null) : null;
  sessionRecovery?.demoteWriteAccessAfterFailure?.(error, context);
  sessionRecovery?.handleAuthenticationError?.(error);
  const classification = classifySolidRuntimeOutcomes(outcomesFromError(error));
  const recover = (): Promise<void> => {
    const result = sessionRecovery?.recoverRejectedMutation?.(context, error, source);
    return result instanceof Promise ? result : Promise.resolve();
  };
  const recovery =
    classification.state === 'deferred' &&
    classification.retryAt !== undefined &&
    classification.retryAt.getTime() > Date.now()
      ? waitUntil(classification.retryAt).then(recover)
      : recover();
  const shouldNotify = !noticedRecoveries.has(recovery);
  if (shouldNotify) noticedRecoveries.add(recovery);
  return from(recovery).pipe(
    tap(() => {
      if (shouldNotify) {
        snackService.open({
          type: 'ERROR',
          msg: T.PS.SOLID.WRITE_RESTORED,
        });
      }
    }),
    catchError((recoveryError) => {
      logRecoveryFailure(recoveryError, source);
      if (shouldNotify) {
        snackService.open({
          type: 'ERROR',
          msg: T.PS.SOLID.ACTION_FAILED,
        });
      }
      return EMPTY;
    }),
    finalize(() => {
      if (shouldNotify) noticedRecoveries.delete(recovery);
    }),
    ignoreElements(),
  );
};

const waitUntil = (retryAt: Date): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, retryAt.getTime() - Date.now()));

const logRecoveryFailure = (error: unknown, operation: string): void => {
  Log.err('Solid rejected mutation recovery failed', {
    operation,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
};

const structuredErrorFields = (
  error: unknown,
  operation: string,
): {
  operation: string;
  model: string;
  errorName: string;
  runtimeCode?: string;
  httpStatus?: number;
} => {
  const errorLike =
    typeof error === 'object' && error !== null
      ? (error as {
          name?: unknown;
          code?: unknown;
          details?: unknown;
          httpStatus?: unknown;
          outcomes?: unknown;
          status?: unknown;
        })
      : {};
  const details =
    typeof errorLike.details === 'object' && errorLike.details !== null
      ? (errorLike.details as { httpStatus?: unknown; status?: unknown })
      : {};
  const outcomeHttpStatus = Array.isArray(errorLike.outcomes)
    ? errorLike.outcomes.find(
        (outcome): outcome is { httpStatus: number } =>
          typeof outcome === 'object' &&
          outcome !== null &&
          'httpStatus' in outcome &&
          typeof outcome.httpStatus === 'number',
      )?.httpStatus
    : undefined;
  const httpStatus = [
    errorLike.httpStatus,
    errorLike.status,
    details.httpStatus,
    details.status,
    outcomeHttpStatus,
  ].find((value): value is number => typeof value === 'number');
  const modelMatch = /^Solid([A-Za-z]+)PersistenceEffects/.exec(operation);

  return {
    operation,
    model: modelMatch?.[1]?.toLowerCase() ?? 'unknown',
    errorName: typeof errorLike.name === 'string' ? errorLike.name : 'UnknownError',
    ...(typeof errorLike.code === 'string' ? { runtimeCode: errorLike.code } : {}),
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
};
