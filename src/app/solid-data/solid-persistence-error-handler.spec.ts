import { EMPTY } from 'rxjs';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';

type TestRecovery = SolidSessionRecoveryService & {
  recoverRejectedMutation(error: unknown, source: string): Promise<void> | void;
  demoteWriteAccessAfterFailure(error: unknown): void;
};

describe('handleSolidPersistenceError', () => {
  let snackService: jasmine.SpyObj<SnackService>;
  let sessionRecovery: jasmine.SpyObj<TestRecovery>;

  beforeEach(() => {
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    sessionRecovery = jasmine.createSpyObj<TestRecovery>('SolidSessionRecoveryService', [
      'handleAuthenticationError',
      'recoverRejectedMutation',
      'demoteWriteAccessAfterFailure',
    ]);
    sessionRecovery.handleAuthenticationError.and.returnValue(false);
    spyOn(Log, 'err');
  });

  it('logs only redacted error metadata and keeps the failure loud', () => {
    const error = Object.assign(new Error('contains details'), {
      body: 'user content',
    });

    const result = handleSolidPersistenceError({
      error,
      snackService,
      sessionRecovery,
      source: 'SolidTestPersistenceEffects: failed to persist test data',
    });

    expect(result).toBe(EMPTY);
    expect(Log.err).toHaveBeenCalledOnceWith(
      'SolidTestPersistenceEffects: failed to persist test data',
      {
        operation: 'SolidTestPersistenceEffects: failed to persist test data',
        model: 'test',
        errorName: 'Error',
      },
    );
    expect(snackService.open).toHaveBeenCalledOnceWith({
      type: 'ERROR',
      msg: T.PS.SOLID.WRITE_RESTORED,
    });
    expect(sessionRecovery.recoverRejectedMutation).toHaveBeenCalledOnceWith(
      error,
      'SolidTestPersistenceEffects: failed to persist test data',
    );
    expect(sessionRecovery.demoteWriteAccessAfterFailure).toHaveBeenCalledOnceWith(error);
  });

  it('delegates authentication failures to session recovery', () => {
    const error = new Error('Authentication session expired');
    sessionRecovery.handleAuthenticationError.and.returnValue(true);

    const result = handleSolidPersistenceError({
      error,
      snackService,
      sessionRecovery,
      source: 'SolidTestPersistenceEffects: failed to persist test data',
    });

    expect(result).toBe(EMPTY);
    expect(sessionRecovery.handleAuthenticationError).toHaveBeenCalledOnceWith(error);
    expect(sessionRecovery.recoverRejectedMutation).toHaveBeenCalledTimes(1);
    expect(snackService.open).not.toHaveBeenCalled();
  });

  it('deduplicates the notification until shared asynchronous recovery completes', async () => {
    let finishRecovery: (() => void) | undefined;
    const recovery = new Promise<void>((resolve) => {
      finishRecovery = resolve;
    });
    sessionRecovery.recoverRejectedMutation.and.returnValue(recovery);
    const error = new Error('write failed');
    const input = {
      error,
      snackService,
      sessionRecovery,
      source: 'SolidTestPersistenceEffects: failed to persist test data',
    };

    handleSolidPersistenceError(input);
    handleSolidPersistenceError(input);

    expect(snackService.open).toHaveBeenCalledTimes(1);
    finishRecovery?.();
    await recovery;
    await Promise.resolve();
    handleSolidPersistenceError(input);
    expect(snackService.open).toHaveBeenCalledTimes(2);
  });
});
