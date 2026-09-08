import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing } from '@solid-intents/runtime';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import { SP_PLUGIN_METADATA, SP_PLUGIN_USER_DATA } from './solid-productivity-vocab';
import {
  pluginMetadataToSolidChanges,
  pluginMetadataToSolidCreateInput,
  pluginUserDataToSolidChanges,
  pluginUserDataToSolidCreateInput,
  solidPluginMetadataQuery,
  solidPluginUserDataQuery,
  solidThingToPluginMetadata,
  solidThingToPluginUserData,
} from './solid-plugin-data.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidPluginContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidPluginDataRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);

  async loadPluginUserData(): Promise<SolidRepositoryRead<PluginUserData[]>> {
    const scope = this.pluginUserDataContainerScope();

    const result = await this.solidRuntime.client.things.query(solidPluginUserDataQuery, {
      scope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(scope.uri, result.things)
        .map((thing) => solidThingToPluginUserData(thing))
        .filter(
          (pluginUserData): pluginUserData is PluginUserData => pluginUserData !== null,
        ),
      result.metadata,
    );
  }

  async loadPluginMetadata(): Promise<SolidRepositoryRead<PluginMetadata[]>> {
    const scope = this.pluginMetadataContainerScope();

    const result = await this.solidRuntime.client.things.query(solidPluginMetadataQuery, {
      scope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(scope.uri, result.things)
        .map((thing) => solidThingToPluginMetadata(thing))
        .filter((metadata): metadata is PluginMetadata => metadata !== null),
      result.metadata,
    );
  }

  savePluginUserData(pluginUserData: PluginUserData): Promise<PluginUserData> {
    return this.mutationCoordinator.run(
      solidMutationKey('pluginUserData', pluginUserData.id),
      () => this.savePluginUserDataNow(pluginUserData),
    );
  }

  savePluginMetadata(pluginMetadata: PluginMetadata): Promise<PluginMetadata> {
    return this.mutationCoordinator.run(
      solidMutationKey('pluginMetadata', pluginMetadata.id),
      () => this.savePluginMetadataNow(pluginMetadata),
    );
  }

  deletePluginUserData(pluginId: string): Promise<void> {
    return this.mutationCoordinator.run(
      solidMutationKey('pluginUserData', pluginId),
      () => this.deletePluginUserDataNow(pluginId),
    );
  }

  deletePluginMetadata(pluginId: string): Promise<void> {
    return this.mutationCoordinator.run(
      solidMutationKey('pluginMetadata', pluginId),
      () => this.deletePluginMetadataNow(pluginId),
    );
  }

  private async savePluginUserDataNow(
    pluginUserData: PluginUserData,
  ): Promise<PluginUserData> {
    const existingThing = await this.findPluginUserDataThing(pluginUserData.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        pluginUserDataToSolidCreateInput(
          pluginUserData,
          this.solidRuntime.pluginUserDataProfile,
        ),
      );
      const createdPluginUserData = solidThingToPluginUserData(created);
      if (!createdPluginUserData) {
        throw new Error('Expected Solid plugin user data create result');
      }
      return createdPluginUserData;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      pluginUserDataToSolidChanges(pluginUserData),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid plugin user data update commit, received ${commit.kind}`,
      );
    }

    const updatedPluginUserData = solidThingToPluginUserData(commit.result);
    if (!updatedPluginUserData) {
      throw new Error('Expected Solid plugin user data update result');
    }
    return updatedPluginUserData;
  }

  private async savePluginMetadataNow(
    pluginMetadata: PluginMetadata,
  ): Promise<PluginMetadata> {
    const existingThing = await this.findPluginMetadataThing(pluginMetadata.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        pluginMetadataToSolidCreateInput(
          pluginMetadata,
          this.solidRuntime.pluginMetadataProfile,
        ),
      );
      const createdPluginMetadata = solidThingToPluginMetadata(created);
      if (!createdPluginMetadata) {
        throw new Error('Expected Solid plugin metadata create result');
      }
      return createdPluginMetadata;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      pluginMetadataToSolidChanges(pluginMetadata),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid plugin metadata update commit, received ${commit.kind}`,
      );
    }

    const updatedPluginMetadata = solidThingToPluginMetadata(commit.result);
    if (!updatedPluginMetadata) {
      throw new Error('Expected Solid plugin metadata update result');
    }
    return updatedPluginMetadata;
  }

  private async deletePluginUserDataNow(pluginId: string): Promise<void> {
    const existingThing = await this.findPluginUserDataThing(pluginId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  private async deletePluginMetadataNow(pluginId: string): Promise<void> {
    const existingThing = await this.findPluginMetadataThing(pluginId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  private async findPluginUserDataThing(pluginId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidPluginUserDataQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_PLUGIN_USER_DATA.id,
            value: pluginId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.pluginUserDataContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private async findPluginMetadataThing(pluginId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidPluginMetadataQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_PLUGIN_METADATA.id,
            value: pluginId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.pluginMetadataContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private pluginUserDataContainerScope(): SolidPluginContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.pluginUserData,
    };
  }

  private pluginMetadataContainerScope(): SolidPluginContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.pluginMetadata,
    };
  }
}
