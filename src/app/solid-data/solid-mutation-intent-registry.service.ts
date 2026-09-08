import { inject, Injectable } from '@angular/core';
import { AppDataComplete } from '../op-log/model/model-config';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import {
  SolidContainerKey,
  solidTaskIdsForAction,
} from './solid-persistent-action-ownership';
import { SolidThingIdentityRegistry } from './solid-thing-identity-registry.service';

export interface SolidMutationIntentContext {
  action: PersistentAction;
  actionType: string;
  entityKeys: readonly string[];
  resourceUris: readonly string[];
  containerKeys: readonly SolidContainerKey[];
  projection: AppDataComplete | null;
  catalogGeneration: number;
}

@Injectable({ providedIn: 'root' })
export class SolidMutationIntentRegistry {
  private readonly identities = inject(SolidThingIdentityRegistry);
  private latestContext: SolidMutationIntentContext | null = null;
  private readonly failedContexts = new WeakMap<object, SolidMutationIntentContext>();

  record(
    action: PersistentAction,
    containerKeys: readonly SolidContainerKey[],
    catalog: { appDataComplete: AppDataComplete; generation: number } | null,
  ): SolidMutationIntentContext {
    const entities = entitiesForAction(action);
    const resourceUris = entities
      .map(({ model, id }) => this.identities.get(model, id)?.sourceUri)
      .filter((uri): uri is string => uri !== undefined);
    const context: SolidMutationIntentContext = {
      action,
      actionType: action.type,
      entityKeys: entities.map(({ model, id }) => `${model}:${id}`),
      resourceUris: Array.from(new Set(resourceUris)),
      containerKeys: Array.from(new Set(containerKeys)),
      projection: catalog?.appDataComplete ?? null,
      catalogGeneration: catalog?.generation ?? 0,
    };
    this.latestContext = context;
    return context;
  }

  latest(): SolidMutationIntentContext | null {
    return this.latestContext;
  }

  associateFailure(error: unknown, context: SolidMutationIntentContext | null): void {
    if (context !== null && typeof error === 'object' && error !== null) {
      this.failedContexts.set(error, context);
    }
  }

  forFailure(error: unknown): SolidMutationIntentContext | null {
    return typeof error === 'object' && error !== null
      ? (this.failedContexts.get(error) ?? this.latestContext)
      : this.latestContext;
  }

  clear(): void {
    this.latestContext = null;
  }
}

const entitiesForAction = (
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
