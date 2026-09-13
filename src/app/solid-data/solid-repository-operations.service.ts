import { inject, Injectable } from '@angular/core';
import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  deterministicThingUri,
  SolidThingIdentityRegistry,
} from './solid-thing-identity-registry.service';
import {
  normalizeSolidChanges,
  normalizeSolidCreateInput,
} from './solid-semantic-profiles';
import { classifySolidRuntimeOutcomes, outcomesFromError } from './solid-runtime-outcome';

export interface SolidRepositoryMutation<T> {
  model: string;
  id: string;
  value: T;
  resourceName: string;
  profile: ThingWriteProfile;
  createInput: CreateThingInput;
  changes: ThingChanges;
  map: (thing: Thing) => T;
}

@Injectable({ providedIn: 'root' })
export class SolidRepositoryOperations {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly identities = inject(SolidThingIdentityRegistry);

  remember<T>(model: string, id: string, thing: Thing, mapped: T): T {
    this.identities.remember(model, id, thing);
    return mapped;
  }

  upsert<T>(mutation: SolidRepositoryMutation<T>): Promise<T> {
    return this.identities.get(mutation.model, mutation.id) === null
      ? this.create(mutation)
      : this.update(mutation);
  }

  async create<T>(mutation: SolidRepositoryMutation<T>): Promise<T> {
    try {
      const plan = await this.solidRuntime.client.writes.planCreate(
        normalizeSolidCreateInput(mutation.createInput),
      );
      const commit = await this.solidRuntime.client.writes.commit(plan);
      if (commit.kind !== 'thing.create') {
        throw new Error(`Expected Solid create commit, received ${commit.kind}`);
      }
      const thing = commit.result;
      return this.remember(mutation.model, mutation.id, thing, mutation.value);
    } catch (error) {
      const outcomes = outcomesFromError(error);
      const classification = classifySolidRuntimeOutcomes(outcomes);
      if (
        !isResourceAlreadyExistsError(error) &&
        !isAuthoritativeRefreshError(error) &&
        !(classification.state === 'confirmed' && outcomes.length > 0) &&
        classification.state !== 'recoverable-success' &&
        classification.state !== 'authoritative-refresh'
      ) {
        throw error;
      }

      const deterministicUri = deterministicThingUri(
        mutation.profile,
        mutation.resourceName,
      );
      const resourceUri = existingResourceUri(error) ?? documentUri(deterministicUri);
      await this.solidRuntime.client.discovery.refresh({ uris: [resourceUri] });
      const podThing = await this.solidRuntime.client.things.get(deterministicUri);
      if (podThing === null) {
        throw error;
      }
      return this.remember(mutation.model, mutation.id, podThing, mutation.map(podThing));
    }
  }

  async update<T>(mutation: SolidRepositoryMutation<T>): Promise<T> {
    const thingUri =
      this.identities.get(mutation.model, mutation.id)?.thingUri ??
      deterministicThingUri(mutation.profile, mutation.resourceName);
    try {
      const plan = await this.solidRuntime.client.writes.planUpdate(
        thingUri,
        normalizeSolidChanges(mutation.profile.type, mutation.changes),
      );
      const commit = await this.solidRuntime.client.writes.commit(plan);
      if (commit.kind !== 'thing.update') {
        throw new Error(`Expected Solid update commit, received ${commit.kind}`);
      }
      return this.remember(
        mutation.model,
        mutation.id,
        commit.result,
        mutation.map(commit.result),
      );
    } catch (error) {
      const outcomes = outcomesFromError(error);
      const classification = classifySolidRuntimeOutcomes(outcomes);
      if (
        classification.state === 'deferred' ||
        (classification.state === 'confirmed' &&
          outcomes.length === 0 &&
          !isAuthoritativeRefreshError(error))
      ) {
        throw error;
      }
      const podThing = await this.refreshThing(thingUri);
      if (podThing === null) {
        throw error;
      }
      return this.remember(mutation.model, mutation.id, podThing, mutation.map(podThing));
    }
  }

  async delete(
    model: string,
    id: string,
    profile: ThingWriteProfile,
    resourceName: string,
  ): Promise<void> {
    const thingUri =
      this.identities.get(model, id)?.thingUri ??
      deterministicThingUri(profile, resourceName);
    try {
      const plan = await this.solidRuntime.client.writes.planDelete(thingUri);
      const commit = await this.solidRuntime.client.writes.commit(plan);
      if (commit.kind !== 'thing.delete') {
        throw new Error(`Expected Solid delete commit, received ${commit.kind}`);
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        const outcomes = outcomesFromError(error);
        const classification = classifySolidRuntimeOutcomes(outcomes);
        if (
          classification.state === 'deferred' ||
          (classification.state === 'confirmed' &&
            outcomes.length === 0 &&
            !isAuthoritativeRefreshError(error))
        ) {
          throw error;
        }
        const podThing = await this.refreshThing(thingUri);
        if (podThing !== null) {
          throw error;
        }
      } else {
        await this.solidRuntime.client.discovery.refresh({
          uris: [documentUri(thingUri)],
        });
      }
      if (!isNotFoundError(error) && outcomesFromError(error).length === 0) {
        throw error;
      }
    }
    this.identities.forget(model, id);
  }

  private async refreshThing(thingUri: string): Promise<Thing | null> {
    await this.solidRuntime.client.discovery.refresh({
      uris: [documentUri(thingUri)],
    });
    return this.solidRuntime.client.things.get(thingUri);
  }
}

const isResourceAlreadyExistsError = (
  error: unknown,
): error is {
  code: 'resource-already-exists';
  details?: Readonly<Record<string, unknown>>;
} =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'resource-already-exists';

const existingResourceUri = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return null;
  }
  const details = error.details;
  if (typeof details !== 'object' || details === null) {
    return null;
  }
  const uri = 'uri' in details ? details.uri : undefined;
  return typeof uri === 'string' ? uri : null;
};

const documentUri = (thingUri: string): string => thingUri.split('#')[0];

const isNotFoundError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const errorLike = error as { httpStatus?: unknown; status?: unknown };
  return errorLike.httpStatus === 404 || errorLike.status === 404;
};

const isAuthoritativeRefreshError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const errorLike = error as {
    code?: unknown;
    httpStatus?: unknown;
    status?: unknown;
    details?: unknown;
  };
  if (errorLike.code === 'write-plan-conflict') return true;
  const details =
    typeof errorLike.details === 'object' && errorLike.details !== null
      ? (errorLike.details as {
          httpStatus?: unknown;
          status?: unknown;
          failure?: { httpStatus?: unknown };
        })
      : {};
  return [
    errorLike.httpStatus,
    errorLike.status,
    details.httpStatus,
    details.status,
    details.failure?.httpStatus,
  ].some((status) => status === 409 || status === 412);
};
