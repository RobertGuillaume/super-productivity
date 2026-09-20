import { TestBed } from '@angular/core/testing';
import type { Thing } from '@solid-intents/runtime';
import { EntityType, OpType } from '../op-log/core/operation.types';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { SolidMutationIntentRegistry } from './solid-mutation-intent-registry.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';

describe('SolidMutationIntentRegistry', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('captures an immutable action context bound to runtime identity', () => {
    const identities = TestBed.inject(SolidThingIdentityRegistry);
    identities.remember('task', 'task-1', {
      uri: 'https://pod.example/calendar/work.ttl#todo',
      source: { uri: 'https://pod.example/calendar/work.ttl', kind: 'rdf' },
    } as Thing);
    const action: PersistentAction = {
      type: '[TaskShared] Update Task',
      meta: {
        isPersistent: true,
        entityType: 'TASK' as EntityType,
        entityId: 'task-1',
        opType: OpType.Update,
      },
    };
    const registry = TestBed.inject(SolidMutationIntentRegistry);
    const context = registry.record(action, ['tasks', 'projects'], 7, {
      runtimeGeneration: 3,
      storageRoot: 'https://pod.example/',
      webId: 'https://pod.example/profile/card#me',
    });

    expect(context.action).toBe(action);
    expect(context.entityKeys).toEqual(['task:task-1']);
    expect(context.resourceUris).toEqual(['https://pod.example/calendar/work.ttl']);
    expect(context.containerKeys).toEqual(['tasks', 'projects']);
    expect(context.catalogGeneration).toBe(7);
    expect(context.runtimeGeneration).toBe(3);
    expect(context.storageRoot).toBe('https://pod.example/');
    expect(context.webId).toBe('https://pod.example/profile/card#me');
    expect(registry.forAction(action)).toBe(context);
    expect(Object.isFrozen(context)).toBeTrue();
  });

  it('never falls back to an unrelated latest action', () => {
    const registry = TestBed.inject(SolidMutationIntentRegistry);
    const first = actionFor('task-1');
    const second = actionFor('task-2');
    const binding = {
      runtimeGeneration: 1,
      storageRoot: 'https://pod.example/',
      webId: 'https://pod.example/profile/card#me',
    };

    const firstContext = registry.record(first, ['tasks'], 1, binding);
    registry.record(second, ['tasks'], 2, binding);

    expect(registry.forAction(first)).toBe(firstContext);
    expect(registry.forAction({})).toBeNull();
  });
});

const actionFor = (id: string): PersistentAction => ({
  type: '[TaskShared] Update Task',
  meta: {
    isPersistent: true,
    entityType: 'TASK' as EntityType,
    entityId: id,
    opType: OpType.Update,
  },
});
