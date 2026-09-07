import { EMPTY } from 'rxjs';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';

interface SolidAuthenticationErrorHandler {
  handleAuthenticationError?(error: unknown): boolean;
  recoverRejectedMutation?(): void;
}

let isFailureNoticeDeduplicated = false;

export const handleSolidPersistenceError = ({
  error,
  snackService,
  sessionRecovery,
  source,
}: {
  error: unknown;
  snackService: SnackService;
  sessionRecovery?: SolidAuthenticationErrorHandler;
  source: string;
}): typeof EMPTY => {
  const fields = structuredErrorFields(error, source);
  Log.err(source, {
    ...fields,
  });
  sessionRecovery?.recoverRejectedMutation?.();
  if (sessionRecovery?.handleAuthenticationError?.(error)) {
    return EMPTY;
  }

  if (!isFailureNoticeDeduplicated) {
    isFailureNoticeDeduplicated = true;
    snackService.open({
      type: 'ERROR',
      msg: T.PS.SOLID.WRITE_RESTORED,
    });
    queueMicrotask(() => {
      isFailureNoticeDeduplicated = false;
    });
  }
  return EMPTY;
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
