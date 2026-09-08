import { TestBed } from '@angular/core/testing';
import type { Thing } from '@solid-intents/runtime';
import { EntityType, OpType } from '../op-log/core/operation.types';
import { AppDataComplete } from '../op-log/model/model-config';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { SolidMutationIntentRegistry } from './solid-mutation-intent-registry.service';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';

describe('SolidMutationIntentRegistry', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('captures the exact resource, targets, projection, and generation for an intent', () => {
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
    const projection = {} as AppDataComplete;

    const context = TestBed.inject(SolidMutationIntentRegistry).record(
      action,
      ['tasks', 'projects'],
      { appDataComplete: projection, generation: 7 },
    );

    expect(context.action).toBe(action);
    expect(context.entityKeys).toEqual(['task:task-1']);
    expect(context.resourceUris).toEqual(['https://pod.example/calendar/work.ttl']);
    expect(context.containerKeys).toEqual(['tasks', 'projects']);
    expect(context.projection).toBe(projection);
    expect(context.catalogGeneration).toBe(7);
  });
});
