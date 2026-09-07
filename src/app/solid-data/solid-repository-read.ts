import type { QueryMetadata } from '@solid-intents/runtime';

/**
 * A catalog-backed repository result together with the runtime evidence used to
 * produce it. Keeping the metadata allows the coordinator to distinguish a
 * complete empty result from an incomplete catalog without starting discovery
 * from inside a repository.
 */
export interface SolidRepositoryRead<T> {
  value: T;
  metadata: readonly QueryMetadata[];
}

export const solidRepositoryRead = <T>(
  value: T,
  ...metadata: Array<QueryMetadata | undefined>
): SolidRepositoryRead<T> => ({
  value,
  metadata: metadata.filter((item): item is QueryMetadata => item !== undefined),
});
