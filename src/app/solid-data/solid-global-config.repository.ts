import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
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

type SolidGlobalConfigContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidGlobalConfigRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadGlobalConfig(): Promise<GlobalConfigState | null> {
    const configContainerScope = this.globalConfigContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [configContainerScope.uri],
      mode: 'balanced',
    });

    const existingThing = await this.findGlobalConfigThing();
    if (existingThing === null) {
      return null;
    }

    return solidThingToGlobalConfig(existingThing)?.config ?? null;
  }

  async saveGlobalConfig(config: GlobalConfigState): Promise<GlobalConfigState> {
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
    const result = await this.solidRuntime.client.things.query(
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
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private globalConfigContainerScope(): SolidGlobalConfigContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.config,
    };
  }
}
