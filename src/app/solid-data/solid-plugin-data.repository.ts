import { inject, Injectable } from '@angular/core';
import type { RuntimeScope } from '@solid-intents/runtime';
import { PluginMetadata, PluginUserData } from '../plugins/plugin-persistence.model';
import {
  pluginMetadataResourceName,
  pluginMetadataToSolidChanges,
  pluginMetadataToSolidCreateInput,
  pluginUserDataResourceName,
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
import { SolidRepositoryOperations } from './solid-repository-operations.service';

type SolidPluginContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidPluginDataRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadPluginUserData(): Promise<SolidRepositoryRead<PluginUserData[]>> {
    const scope = this.pluginUserDataContainerScope();

    const result = await this.solidRuntime.client.things.query(solidPluginUserDataQuery, {
      scope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(scope.uri, result.things)
        .map((thing) => {
          const value = solidThingToPluginUserData(thing);
          return value === null
            ? null
            : this.operations.remember('pluginUserData', value.id, thing, value);
        })
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
        .map((thing) => {
          const value = solidThingToPluginMetadata(thing);
          return value === null
            ? null
            : this.operations.remember('pluginMetadata', value.id, thing, value);
        })
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
    return this.operations.upsert({
      model: 'pluginUserData',
      id: pluginUserData.id,
      value: pluginUserData,
      resourceName: pluginUserDataResourceName(pluginUserData.id),
      profile: this.solidRuntime.pluginUserDataProfile,
      createInput: pluginUserDataToSolidCreateInput(
        pluginUserData,
        this.solidRuntime.pluginUserDataProfile,
      ),
      changes: pluginUserDataToSolidChanges(pluginUserData),
      map: (thing) => {
        const value = solidThingToPluginUserData(thing);
        if (value === null) {
          throw new Error('Expected Solid plugin user data mutation result');
        }
        return value;
      },
    });
  }

  private async savePluginMetadataNow(
    pluginMetadata: PluginMetadata,
  ): Promise<PluginMetadata> {
    return this.operations.upsert({
      model: 'pluginMetadata',
      id: pluginMetadata.id,
      value: pluginMetadata,
      resourceName: pluginMetadataResourceName(pluginMetadata.id),
      profile: this.solidRuntime.pluginMetadataProfile,
      createInput: pluginMetadataToSolidCreateInput(
        pluginMetadata,
        this.solidRuntime.pluginMetadataProfile,
      ),
      changes: pluginMetadataToSolidChanges(pluginMetadata),
      map: (thing) => {
        const value = solidThingToPluginMetadata(thing);
        if (value === null) {
          throw new Error('Expected Solid plugin metadata mutation result');
        }
        return value;
      },
    });
  }

  private async deletePluginUserDataNow(pluginId: string): Promise<void> {
    await this.operations.delete(
      'pluginUserData',
      pluginId,
      this.solidRuntime.pluginUserDataProfile,
      pluginUserDataResourceName(pluginId),
    );
  }

  private async deletePluginMetadataNow(pluginId: string): Promise<void> {
    await this.operations.delete(
      'pluginMetadata',
      pluginId,
      this.solidRuntime.pluginMetadataProfile,
      pluginMetadataResourceName(pluginId),
    );
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
