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

type SolidIssueProviderContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidIssueProviderRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadIssueProviders(): Promise<IssueProvider[]> {
    const issueProviderContainerScope = this.issueProviderContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [issueProviderContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidIssueProviderQuery, {
      scope: issueProviderContainerScope,
      autoDiscover: true,
    });

    return result.things
      .map(solidThingToIssueProviderRecord)
      .sort((a, b) => a.order - b.order)
      .map((record) => record.issueProvider);
  }

  async saveIssueProvider(
    issueProvider: IssueProvider,
    order = 0,
  ): Promise<IssueProvider> {
    const existingThing = await this.findIssueProviderThing(issueProvider.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        issueProviderToSolidCreateInput(
          issueProvider,
          this.solidRuntime.issueProviderProfile,
          order,
        ),
      );
      return solidThingToIssueProvider(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      issueProviderToSolidChanges(issueProvider, order),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid issue provider update commit, received ${commit.kind}`,
      );
    }

    return solidThingToIssueProvider(commit.result);
  }

  async deleteIssueProvider(issueProviderId: string): Promise<void> {
    const existingThing = await this.findIssueProviderThing(issueProviderId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
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
        autoDiscover: true,
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
