import { Observable } from 'rxjs';
import { Log } from '../core/log';
import { SnackService } from '../core/snack/snack.service';
import { T } from '../t.const';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidSessionRecoveryService } from './solid-session-recovery.service';
import { SolidMutationIntentContext } from './solid-mutation-intent-registry.service';

type TestRecovery = SolidSessionRecoveryService & {
  mutationContextFor(action: object): SolidMutationIntentContext | null;
  recoverRejectedMutation(
    context: SolidMutationIntentContext | null,
    error: unknown,
    source: string,
  ): Promise<void> | void;
  demoteWriteAccessAfterFailure(
    error: unknown,
    context: SolidMutationIntentContext | null,
  ): void;
};

describe('handleSolidPersistenceError', () => {
  let snackService: jasmine.SpyObj<SnackService>;
  let sessionRecovery: jasmine.SpyObj<TestRecovery>;

  beforeEach(() => {
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    sessionRecovery = jasmine.createSpyObj<TestRecovery>('SolidSessionRecoveryService', [
      'handleAuthenticationError',
      'mutationContextFor',
      'recoverRejectedMutation',
      'demoteWriteAccessAfterFailure',
    ]);
    sessionRecovery.handleAuthenticationError.and.returnValue(false);
    sessionRecovery.mutationContextFor.and.returnValue(null);
    spyOn(Log, 'err');
  });

  it('logs only redacted error metadata and reports recovery after verification', async () => {
    const error = Object.assign(new Error('contains details'), {
      body: 'user content',
    });
    const action = {};

    await complete(
      handleSolidPersistenceError({
        error,
        snackService,
        sessionRecovery,
        source: 'SolidTestPersistenceEffects: failed to persist test data',
        action,
      }),
    );

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
      null,
      error,
      'SolidTestPersistenceEffects: failed to persist test data',
    );
    expect(sessionRecovery.demoteWriteAccessAfterFailure).toHaveBeenCalledOnceWith(
      error,
      null,
    );
  });

  it('reconciles and releases authentication failures after session recovery', async () => {
    const error = new Error('Authentication session expired');
    sessionRecovery.handleAuthenticationError.and.returnValue(true);

    await complete(
      handleSolidPersistenceError({
        error,
        snackService,
        sessionRecovery,
        source: 'SolidTestPersistenceEffects: failed to persist test data',
      }),
    );

    expect(sessionRecovery.handleAuthenticationError).toHaveBeenCalledOnceWith(error);
    expect(sessionRecovery.recoverRejectedMutation).toHaveBeenCalledOnceWith(
      null,
      error,
      'SolidTestPersistenceEffects: failed to persist test data',
    );
    expect(snackService.open).toHaveBeenCalledOnceWith({
      type: 'ERROR',
      msg: T.PS.SOLID.WRITE_RESTORED,
    });
  });

  it('does not claim restoration when authoritative recovery fails', async () => {
    sessionRecovery.recoverRejectedMutation.and.rejectWith(
      new Error('catalog unavailable'),
    );

    await complete(
      handleSolidPersistenceError({
        error: new Error('write failed'),
        snackService,
        sessionRecovery,
        source: 'SolidTestPersistenceEffects: failed to persist test data',
      }),
    );

    expect(snackService.open).toHaveBeenCalledOnceWith({
      type: 'ERROR',
      msg: T.PS.SOLID.ACTION_FAILED,
    });
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

    const first = complete(handleSolidPersistenceError(input));
    const second = complete(handleSolidPersistenceError(input));

    expect(snackService.open).not.toHaveBeenCalled();
    finishRecovery?.();
    await Promise.all([recovery, first, second]);
    expect(snackService.open).toHaveBeenCalledTimes(1);
    await complete(handleSolidPersistenceError(input));
    expect(snackService.open).toHaveBeenCalledTimes(2);
  });

  it('does not reconcile a deferred failure before the runtime retry deadline', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-09-13T10:00:00.000Z'));
    const retryAt = new Date(Date.now() + 1_000);
    const error = {
      outcomes: [
        {
          status: 'failed',
          operation: { kind: 'rdf.patch' },
          failure: { kind: 'deferred', phase: 'queued', retryAt },
        },
      ],
    };

    const completion = complete(
      handleSolidPersistenceError({
        error,
        snackService,
        sessionRecovery,
        source: 'SolidTestPersistenceEffects: failed to persist test data',
      }),
    );
    expect(sessionRecovery.recoverRejectedMutation).not.toHaveBeenCalled();

    jasmine.clock().tick(999);
    await Promise.resolve();
    expect(sessionRecovery.recoverRejectedMutation).not.toHaveBeenCalled();

    jasmine.clock().tick(1);
    await Promise.resolve();
    expect(sessionRecovery.recoverRejectedMutation).toHaveBeenCalledTimes(1);
    await completion;
    jasmine.clock().uninstall();
  });
});

const complete = (observable: Observable<never>): Promise<void> =>
  new Promise((resolve) => observable.subscribe({ complete: resolve }));
