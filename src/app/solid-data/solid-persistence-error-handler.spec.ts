import { EMPTY } from 'rxjs';
import { Log } from '../core/log';
import { SnackParams } from '../core/snack/snack.model';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';

describe('handleSolidPersistenceError', () => {
  let snackService: jasmine.SpyObj<SnackService>;

  beforeEach(() => {
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    spyOn(Log, 'err');
  });

  it('logs only redacted error metadata and keeps the failure loud', () => {
    const error = Object.assign(new Error('contains details'), {
      body: 'user content',
    });

    const result = handleSolidPersistenceError({
      error,
      snackService,
      source: 'SolidTestPersistenceEffects: failed to persist test data',
    });

    expect(result).toBe(EMPTY);
    expect(Log.err).toHaveBeenCalledOnceWith(
      'SolidTestPersistenceEffects: failed to persist test data',
      { name: 'Error' },
    );
    expect(snackService.open).toHaveBeenCalledOnceWith({
      type: 'ERROR',
      msg: T.F.SYNC.S.PERSIST_FAILED,
      actionStr: T.PS.RELOAD,
      actionFn: jasmine.any(Function) as unknown as () => void,
      config: {
        duration: 0,
      },
    });

    const snackArgs = snackService.open.calls.mostRecent().args[0] as SnackParams;
    expect(snackArgs.actionFn).toEqual(jasmine.any(Function));
  });
});
