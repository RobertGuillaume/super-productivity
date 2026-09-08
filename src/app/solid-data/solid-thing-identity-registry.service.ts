import { Injectable } from '@angular/core';
import type { Thing, ThingWriteProfile } from '@solid-intents/runtime';

export interface SolidThingIdentity {
  thingUri: string;
  sourceUri: string;
}

@Injectable({ providedIn: 'root' })
export class SolidThingIdentityRegistry {
  private readonly identities = new Map<string, SolidThingIdentity>();

  remember(model: string, id: string, thing: Thing): void {
    this.identities.set(identityKey(model, id), {
      thingUri: thing.uri,
      sourceUri: thing.source.uri,
    });
  }

  get(model: string, id: string): SolidThingIdentity | null {
    return this.identities.get(identityKey(model, id)) ?? null;
  }

  forget(model: string, id: string): void {
    this.identities.delete(identityKey(model, id));
  }

  clear(): void {
    this.identities.clear();
  }
}

export const deterministicThingUri = (
  profile: ThingWriteProfile,
  resourceName: string,
): string => {
  const containerUri = profile.target?.containerUri;
  if (containerUri === undefined) {
    throw new Error('Solid write profile has no target container');
  }
  return `${new URL(turtleResourceName(resourceName), containerUri).toString()}#it`;
};

const identityKey = (model: string, id: string): string => `${model}:${id}`;

const turtleResourceName = (resourceName: string): string => {
  const lastSegment = resourceName.split(/[\\/]/u).filter(Boolean).at(-1) ?? 'thing';
  const plainSegment = lastSegment.split(/[?#]/u)[0] ?? 'thing';
  const safeSegment =
    plainSegment
      .trim()
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'thing';
  return safeSegment.endsWith('.ttl') ? safeSegment : `${safeSegment}.ttl`;
};
