import { inject, Injectable } from '@angular/core';
import type {
  RuntimeScope,
  Thing,
  ThingQueryResult,
  Unsubscribe,
} from '@solid-intents/runtime';
import { GlobalConfigState } from '../features/config/global-config.model';
import { SP_GLOBAL_CONFIG } from './solid-productivity-vocab';
import {
  globalConfigToSolidChanges,
  globalConfigToSolidCreateInput,
  SOLID_GLOBAL_CONFIG_ID,
  solidGlobalConfigQuery,
  solidThingToGlobalConfig,
} from './solid-global-config.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidGlobalConfigContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidGlobalConfigRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);

  async loadGlobalConfig(): Promise<SolidRepositoryRead<GlobalConfigState | null>> {
    const result = await this.queryGlobalConfigThing();
    const existingThing =
      this.catalogAuthority.filterThings(
        this.globalConfigContainerScope().uri,
        result.things,
      )[0] ?? null;
    return solidRepositoryRead(
      existingThing === null
        ? null
        : (solidThingToGlobalConfig(existingThing)?.config ?? null),
      result.metadata,
    );
  }

  saveGlobalConfig(config: GlobalConfigState): Promise<GlobalConfigState> {
    return this.mutationCoordinator.run(solidMutationKey('globalConfig', 'root'), () =>
      this.saveGlobalConfigNow(config),
    );
  }

  private async saveGlobalConfigNow(
    config: GlobalConfigState,
  ): Promise<GlobalConfigState> {
    const existingThing = await this.findGlobalConfigThing();

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        globalConfigToSolidCreateInput(config, this.solidRuntime.globalConfigProfile),
      );
      const createdConfig = solidThingToGlobalConfig(created)?.config;
      if (!createdConfig) {
        throw new Error('Expected Solid global config create result');
      }
      return createdConfig;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      globalConfigToSolidChanges(config),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid global config update commit, received ${commit.kind}`,
      );
    }

    const updatedConfig = solidThingToGlobalConfig(commit.result)?.config;
    if (!updatedConfig) {
      throw new Error('Expected Solid global config update result');
    }
    return updatedConfig;
  }

  subscribeGlobalConfig(
    listener: (config: GlobalConfigState | null) => void,
  ): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidGlobalConfigQuery,
      (result) => listener(solidThingToGlobalConfig(result.things[0])?.config ?? null),
      {
        emitInitial: true,
      },
    );
  }

  private async findGlobalConfigThing(): Promise<Thing | null> {
    const result = await this.queryGlobalConfigThing();
    return result.things[0] ?? null;
  }

  private queryGlobalConfigThing(): Promise<ThingQueryResult> {
    return this.solidRuntime.client.things.query(
      {
        ...solidGlobalConfigQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_GLOBAL_CONFIG.id,
            value: SOLID_GLOBAL_CONFIG_ID,
          },
        ],
      },
      {
        limit: 1,
        scope: this.globalConfigContainerScope(),
        autoDiscover: false,
      },
    );
  }

  private globalConfigContainerScope(): SolidGlobalConfigContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.config,
    };
  }
}
