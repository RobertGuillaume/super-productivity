import { inject, Injectable } from '@angular/core';
import type {
  CreateThingInput,
  RuntimeError,
  Thing,
  ThingChanges,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  deterministicThingUri,
  SolidThingIdentityRegistry,
} from './solid-thing-identity-registry.service';

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
      const thing = await this.solidRuntime.client.things.create(mutation.createInput);
      return this.remember(mutation.model, mutation.id, thing, mutation.value);
    } catch (error) {
      if (!isResourceAlreadyExistsError(error)) {
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
    const plan = this.solidRuntime.client.writes.planUpdate(thingUri, mutation.changes);
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
      await this.solidRuntime.client.things.delete(thingUri);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
    this.identities.forget(model, id);
  }
}

const isResourceAlreadyExistsError = (
  error: unknown,
): error is RuntimeError & { code: 'resource-already-exists' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'resource-already-exists';

const existingResourceUri = (error: RuntimeError): string | null => {
  const uri = error.details?.['uri'];
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
