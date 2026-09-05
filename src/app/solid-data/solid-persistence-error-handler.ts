import { EMPTY } from 'rxjs';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';

interface SolidAuthenticationErrorHandler {
  handleAuthenticationError?(error: unknown): boolean;
}

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
  Log.err(source, {
    name: (error as Error | undefined)?.name,
  });
  if (sessionRecovery?.handleAuthenticationError?.(error)) {
    return EMPTY;
  }

  snackService.open({
    type: 'ERROR',
    msg: T.F.SYNC.S.PERSIST_FAILED,
    actionStr: T.PS.RELOAD,
    actionFn: (): void => {
      window.location.reload();
    },
    config: {
      duration: 0,
    },
  });
  return EMPTY;
};
