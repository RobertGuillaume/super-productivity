import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Metric } from '../features/metric/metric.model';
import { SP_METRIC } from './solid-productivity-vocab';
import {
  metricToSolidChanges,
  metricToSolidCreateInput,
  solidMetricQuery,
  solidThingToMetric,
} from './solid-metric.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidMetricContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidMetricRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);

  async loadMetrics(): Promise<SolidRepositoryRead<Metric[]>> {
    const metricContainerScope = this.metricContainerScope();

    const result = await this.solidRuntime.client.things.query(solidMetricQuery, {
      scope: metricContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(metricContainerScope.uri, result.things)
        .map(solidThingToMetric)
        .sort((a, b) => a.id.localeCompare(b.id)),
      result.metadata,
    );
  }

  saveMetric(metric: Metric): Promise<Metric> {
    return this.mutationCoordinator.run(solidMutationKey('metric', metric.id), () =>
      this.saveMetricNow(metric),
    );
  }

  deleteMetric(metricId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('metric', metricId), () =>
      this.deleteMetricNow(metricId),
    );
  }

  private async saveMetricNow(metric: Metric): Promise<Metric> {
    const existingThing = await this.findMetricThing(metric.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        metricToSolidCreateInput(metric, this.solidRuntime.metricProfile),
      );
      return solidThingToMetric(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      metricToSolidChanges(metric),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid metric update commit, received ${commit.kind}`);
    }

    return solidThingToMetric(commit.result);
  }

  private async deleteMetricNow(metricId: string): Promise<void> {
    const existingThing = await this.findMetricThing(metricId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeMetrics(listener: (metrics: Metric[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidMetricQuery,
      (result) =>
        listener(
          result.things.map(solidThingToMetric).sort((a, b) => a.id.localeCompare(b.id)),
        ),
      {
        emitInitial: true,
      },
    );
  }

  private async findMetricThing(metricId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidMetricQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_METRIC.id,
            value: metricId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.metricContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private metricContainerScope(): SolidMetricContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.metrics,
    };
  }
}
