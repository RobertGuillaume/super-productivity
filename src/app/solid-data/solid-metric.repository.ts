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
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidMetricContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidMetricRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadMetrics(): Promise<SolidRepositoryRead<Metric[]>> {
    const metricContainerScope = this.metricContainerScope();

    const result = await this.solidRuntime.client.things.query(solidMetricQuery, {
      scope: metricContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things
        .map((thing) => {
          const metric = solidThingToMetric(thing);
          return this.operations.remember('metric', metric.id, thing, metric);
        })
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
    return this.operations.upsert({
      model: 'metric',
      id: metric.id,
      value: metric,
      resourceName: metric.id,
      profile: this.solidRuntime.metricProfile,
      createInput: metricToSolidCreateInput(metric, this.solidRuntime.metricProfile),
      changes: metricToSolidChanges(metric),
      map: solidThingToMetric,
    });
  }

  private async deleteMetricNow(metricId: string): Promise<void> {
    await this.operations.delete(
      'metric',
      metricId,
      this.solidRuntime.metricProfile,
      metricId,
    );
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
