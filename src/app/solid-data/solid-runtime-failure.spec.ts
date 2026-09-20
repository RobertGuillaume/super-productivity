import {
  classifySolidRuntimeFailure,
  SolidCatalogFailureKind,
  SolidRuntimeRetryPolicy,
  SolidRuntimeStageError,
} from './solid-runtime-failure';

describe('solidRuntimeFailure', () => {
  const cases: Array<[SolidCatalogFailureKind, SolidRuntimeRetryPolicy]> = [
    ['conflict', 'coordination'],
    ['stale-observation', 'coordination'],
    ['ownership-lost', 'coordination'],
    ['upgrade-blocked', 'coordination'],
    ['unavailable', 'online'],
    ['corrupt-store', 'manual'],
    ['quota-exceeded', 'manual'],
    ['identity-mismatch', 'manual'],
    ['closed', 'manual'],
  ];

  cases.forEach(([kind, retryPolicy]) => {
    it(`classifies ${kind} as ${retryPolicy}`, () => {
      const diagnostic = classifySolidRuntimeFailure(
        'discovery-startup',
        catalogFailure(kind),
      );

      expect(diagnostic).toEqual(
        jasmine.objectContaining({
          operation: 'discovery-startup',
          errorName: 'CatalogPersistenceError',
          catalogKind: kind,
          retryPolicy,
        }),
      );
    });
  });

  it('unwraps an application stage and discovery-session cause', () => {
    const discoveryError = Object.assign(new Error('private resource URI'), {
      name: 'DiscoverySessionError',
      code: 'invalid-session',
    });

    const diagnostic = classifySolidRuntimeFailure(
      'discovery-startup',
      new SolidRuntimeStageError('discovery-retained-run', discoveryError),
    );

    expect(diagnostic).toEqual({
      operation: 'discovery-retained-run',
      errorName: 'DiscoverySessionError',
      discoveryCode: 'invalid-session',
      retryPolicy: 'manual',
    });
  });

  it('does not include error messages or resource data in diagnostics', () => {
    const failure = catalogFailure(
      'conflict',
      new DOMException('https://private.example/tasks/secret.ttl', 'AbortError'),
    );

    const diagnostic = classifySolidRuntimeFailure('discovery-startup', failure);
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic.causeName).toBe('AbortError');
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('secret.ttl');
  });

  it('keeps unknown failures manual and content-safe', () => {
    const diagnostic = classifySolidRuntimeFailure(
      'discovery-startup',
      new Error('private title'),
    );

    expect(diagnostic).toEqual({
      operation: 'discovery-startup',
      errorName: 'Error',
      retryPolicy: 'manual',
    });
  });
});

const catalogFailure = (
  kind: SolidCatalogFailureKind,
  cause: unknown = undefined,
): Error & { kind: SolidCatalogFailureKind; cause: unknown } =>
  Object.assign(new Error('private runtime message'), {
    name: 'CatalogPersistenceError',
    kind,
    cause,
  });
