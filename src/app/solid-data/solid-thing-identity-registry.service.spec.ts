import { TestBed } from '@angular/core/testing';
import type { Thing, ThingWriteProfile } from '@solid-intents/runtime';
import {
  deterministicThingUri,
  SolidThingIdentityRegistry,
} from './solid-thing-identity-registry.service';

describe('SolidThingIdentityRegistry', () => {
  it('remembers exact non-deterministic Thing identities', () => {
    const service = TestBed.inject(SolidThingIdentityRegistry);
    service.remember('task', 'task-1', {
      uri: 'https://pod.example/tasks/custom.ttl#todo',
      source: { uri: 'https://pod.example/tasks/custom.ttl', kind: 'rdf' },
    } as Thing);

    expect(service.get('task', 'task-1')).toEqual({
      thingUri: 'https://pod.example/tasks/custom.ttl#todo',
      sourceUri: 'https://pod.example/tasks/custom.ttl',
    });
  });

  it('uses the same safe deterministic filename policy as the runtime', () => {
    const profile = {
      type: 'Task',
      name: 'Task',
      defaultStatus: 'open',
      target: { containerUri: 'https://pod.example/tasks/' },
    } as ThingWriteProfile;

    expect(deterministicThingUri(profile, 'folder/a:b.ttl')).toBe(
      'https://pod.example/tasks/a-b.ttl#it',
    );
  });
});
