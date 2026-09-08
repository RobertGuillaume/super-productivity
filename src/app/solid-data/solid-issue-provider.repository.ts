import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { IssueProvider } from '../features/issue/issue.model';
import { SP_ISSUE_PROVIDER } from './solid-productivity-vocab';
import {
  issueProviderToSolidChanges,
  issueProviderToSolidCreateInput,
  solidIssueProviderQuery,
  solidThingToIssueProvider,
  solidThingToIssueProviderRecord,
} from './solid-issue-provider.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidIssueProviderContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidIssueProviderRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadIssueProviders(): Promise<SolidRepositoryRead<IssueProvider[]>> {
    const issueProviderContainerScope = this.issueProviderContainerScope();

    const result = await this.solidRuntime.client.things.query(solidIssueProviderQuery, {
      scope: issueProviderContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(issueProviderContainerScope.uri, result.things)
        .map((thing) => {
          const record = solidThingToIssueProviderRecord(thing);
          return this.operations.remember(
            'issueProvider',
            record.issueProvider.id,
            thing,
            record,
          );
        })
        .sort((a, b) => a.order - b.order)
        .map((record) => record.issueProvider),
      result.metadata,
    );
  }

  saveIssueProvider(issueProvider: IssueProvider, order = 0): Promise<IssueProvider> {
    return this.mutationCoordinator.run(
      solidMutationKey('issueProvider', issueProvider.id),
      () => this.saveIssueProviderNow(issueProvider, order),
    );
  }

  deleteIssueProvider(issueProviderId: string): Promise<void> {
    return this.mutationCoordinator.run(
      solidMutationKey('issueProvider', issueProviderId),
      () => this.deleteIssueProviderNow(issueProviderId),
    );
  }

  private async saveIssueProviderNow(
    issueProvider: IssueProvider,
    order: number,
  ): Promise<IssueProvider> {
    return this.operations.upsert({
      model: 'issueProvider',
      id: issueProvider.id,
      value: issueProvider,
      resourceName: issueProvider.id,
      profile: this.solidRuntime.issueProviderProfile,
      createInput: issueProviderToSolidCreateInput(
        issueProvider,
        this.solidRuntime.issueProviderProfile,
        order,
      ),
      changes: issueProviderToSolidChanges(issueProvider, order),
      map: solidThingToIssueProvider,
    });
  }

  private async deleteIssueProviderNow(issueProviderId: string): Promise<void> {
    await this.operations.delete(
      'issueProvider',
      issueProviderId,
      this.solidRuntime.issueProviderProfile,
      issueProviderId,
    );
  }

  subscribeIssueProviders(
    listener: (issueProviders: IssueProvider[]) => void,
  ): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidIssueProviderQuery,
      (result) =>
        listener(
          result.things
            .map(solidThingToIssueProviderRecord)
            .sort((a, b) => a.order - b.order)
            .map((record) => record.issueProvider),
        ),
      {
        emitInitial: true,
      },
    );
  }

  private async findIssueProviderThing(issueProviderId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidIssueProviderQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_ISSUE_PROVIDER.id,
            value: issueProviderId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.issueProviderContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private issueProviderContainerScope(): SolidIssueProviderContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.issueProviders,
    };
  }
}
