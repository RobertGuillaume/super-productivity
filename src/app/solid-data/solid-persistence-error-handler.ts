import { EMPTY } from 'rxjs';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';

export const handleSolidPersistenceError = ({
  error,
  snackService,
  source,
}: {
  error: unknown;
  snackService: SnackService;
  source: string;
}): typeof EMPTY => {
  Log.err(source, {
    name: (error as Error | undefined)?.name,
  });
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
