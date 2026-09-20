import { inject, Injectable } from '@angular/core';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import {
  SolidContainerKey,
  solidTaskIdsForAction,
} from './solid-persistent-action-ownership';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';

export interface SolidMutationIntentContext {
  readonly action: PersistentAction | null;
  actionType: string;
  entityKeys: readonly string[];
  resourceUris: readonly string[];
  containerKeys: readonly SolidContainerKey[];
  catalogGeneration: number;
  runtimeGeneration: number;
  storageRoot: string;
  webId: string;
}

export interface SolidMutationBinding {
  readonly runtimeGeneration: number;
  readonly storageRoot: string;
  readonly webId: string;
}

@Injectable({ providedIn: 'root' })
export class SolidMutationIntentRegistry {
  private readonly identities = inject(SolidThingIdentityRegistry);
  private actionContexts = new WeakMap<object, SolidMutationIntentContext>();
  private activeBinding: SolidMutationBinding | null = null;

  record(
    action: PersistentAction,
    containerKeys: readonly SolidContainerKey[],
    catalogGeneration: number,
    binding: SolidMutationBinding,
  ): SolidMutationIntentContext {
    const entities = solidEntitiesForAction(action);
    const resourceUris = entities
      .map(({ model, id }) => this.identities.get(model, id)?.sourceUri)
      .filter((uri): uri is string => uri !== undefined);
    const context: SolidMutationIntentContext = Object.freeze({
      action,
      actionType: action.type,
      entityKeys: Object.freeze(entities.map(({ model, id }) => `${model}:${id}`)),
      resourceUris: Object.freeze(Array.from(new Set(resourceUris))),
      containerKeys: Object.freeze(Array.from(new Set(containerKeys))),
      catalogGeneration,
      runtimeGeneration: binding.runtimeGeneration,
      storageRoot: binding.storageRoot,
      webId: binding.webId,
    });
    this.actionContexts.set(action, context);
    return context;
  }

  forAction(action: object): SolidMutationIntentContext | null {
    return this.actionContexts.get(action) ?? null;
  }

  activateBinding(binding: SolidMutationBinding): void {
    this.activeBinding = binding;
  }

  isCurrent(context: SolidMutationIntentContext): boolean {
    const binding = this.activeBinding;
    return (
      binding !== null &&
      context.runtimeGeneration === binding.runtimeGeneration &&
      context.storageRoot === binding.storageRoot &&
      context.webId === binding.webId
    );
  }

  createSystemContext(
    actionType: string,
    entityKeys: readonly string[] = [],
  ): SolidMutationIntentContext {
    const binding = this.activeBinding;
    if (binding === null) {
      throw new Error('Solid mutation binding is unavailable');
    }
    return Object.freeze({
      action: null,
      actionType,
      entityKeys: Object.freeze(Array.from(new Set(entityKeys))),
      resourceUris: Object.freeze([]),
      containerKeys: Object.freeze([]),
      catalogGeneration: 0,
      ...binding,
    });
  }

  clear(): void {
    this.actionContexts = new WeakMap<object, SolidMutationIntentContext>();
    this.activeBinding = null;
  }
}

export const solidEntitiesForAction = (
  action: PersistentAction,
): Array<{ model: string; id: string }> => {
  const entities: Array<{ model: string; id: string }> = [];
  const taskIds = solidTaskIdsForAction(action);
  taskIds.forEach((id) => entities.push({ model: 'task', id }));
  const model = modelForEntityType(String(action.meta.entityType));
  const entityIds = Array.isArray(action.meta.entityId)
    ? action.meta.entityId
    : [action.meta.entityId];
  if (model !== null) {
    entityIds
      .filter((id): id is string => typeof id === 'string')
      .forEach((id) => entities.push({ model, id }));
  }
  return Array.from(
    new Map(
      entities.map((entity) => [`${entity.model}:${entity.id}`, entity] as const),
    ).values(),
  );
};

const modelForEntityType = (entityType: string): string | null => {
  const models: Readonly<Record<string, string>> = {
    TASK: 'task',
    PROJECT: 'project',
    TAG: 'tag',
    NOTE: 'note',
    SECTION: 'section',
    TASK_REPEAT_CFG: 'taskRepeatCfg',
    BOARD: 'board',
    METRIC: 'metric',
    ISSUE_PROVIDER: 'issueProvider',
    SIMPLE_COUNTER: 'simpleCounter',
  };
  return models[entityType] ?? null;
};
