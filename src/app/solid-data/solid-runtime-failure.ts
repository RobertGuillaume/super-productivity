export type SolidCatalogFailureKind =
  | 'identity-mismatch'
  | 'quota-exceeded'
  | 'corrupt-store'
  | 'unavailable'
  | 'upgrade-blocked'
  | 'closed'
  | 'conflict'
  | 'ownership-lost'
  | 'stale-observation';

export type SolidRuntimeRetryPolicy = 'coordination' | 'online' | 'manual';

export interface SolidRuntimeFailureDiagnostic {
  operation: string;
  errorName: string;
  catalogKind?: SolidCatalogFailureKind;
  discoveryCode?: string;
  causeName?: string;
  retryPolicy: SolidRuntimeRetryPolicy;
}

const CATALOG_FAILURE_KINDS = new Set<SolidCatalogFailureKind>([
  'identity-mismatch',
  'quota-exceeded',
  'corrupt-store',
  'unavailable',
  'upgrade-blocked',
  'closed',
  'conflict',
  'ownership-lost',
  'stale-observation',
]);

const COORDINATION_FAILURE_KINDS = new Set<SolidCatalogFailureKind>([
  'conflict',
  'ownership-lost',
  'stale-observation',
  'upgrade-blocked',
]);

export class SolidRuntimeStageError extends Error {
  override readonly name = 'SolidRuntimeStageError';

  constructor(
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(`Solid runtime stage failed: ${operation}`);
  }
}

export const runSolidRuntimeStage = async <T>(
  operation: string,
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    throw new SolidRuntimeStageError(operation, error);
  }
};

export const classifySolidRuntimeFailure = (
  fallbackOperation: string,
  error: unknown,
): SolidRuntimeFailureDiagnostic => {
  const chain = errorChain(error);
  const stage = chain.find(isSolidRuntimeStageError);
  const primary = chain.find((entry) => !isSolidRuntimeStageError(entry)) ?? error;
  const catalogError = chain.find(isCatalogPersistenceError);
  const discoveryError = chain.find(isDiscoverySessionError);
  const catalogKind = catalogError?.kind;

  return {
    operation: stage?.operation ?? fallbackOperation,
    errorName: errorName(primary),
    ...(catalogKind === undefined ? {} : { catalogKind }),
    ...(discoveryError === undefined ? {} : { discoveryCode: discoveryError.code }),
    ...(catalogError === undefined ? {} : { causeName: errorName(catalogError.cause) }),
    retryPolicy:
      catalogKind === 'unavailable'
        ? 'online'
        : catalogKind !== undefined && COORDINATION_FAILURE_KINDS.has(catalogKind)
          ? 'coordination'
          : 'manual',
  };
};

const errorChain = (error: unknown): unknown[] => {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current['cause'];
  }

  return chain.length === 0 ? [error] : chain;
};

const isSolidRuntimeStageError = (value: unknown): value is SolidRuntimeStageError =>
  value instanceof SolidRuntimeStageError;

const isCatalogPersistenceError = (
  value: unknown,
): value is { kind: SolidCatalogFailureKind; cause: unknown } => {
  if (!isRecord(value) || value['name'] !== 'CatalogPersistenceError') {
    return false;
  }
  const kind = value['kind'];
  return (
    typeof kind === 'string' && CATALOG_FAILURE_KINDS.has(kind as SolidCatalogFailureKind)
  );
};

const isDiscoverySessionError = (value: unknown): value is { code: string } =>
  isRecord(value) &&
  value['name'] === 'DiscoverySessionError' &&
  typeof value['code'] === 'string';

const errorName = (value: unknown): string =>
  isRecord(value) && typeof value['name'] === 'string' ? value['name'] : 'UnknownError';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
