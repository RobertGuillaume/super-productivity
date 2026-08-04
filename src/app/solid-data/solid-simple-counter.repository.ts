import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { SimpleCounter } from '../features/simple-counter/simple-counter.model';
import { SP_SIMPLE_COUNTER } from './solid-productivity-vocab';
import {
  simpleCounterToSolidChanges,
  simpleCounterToSolidCreateInput,
  solidSimpleCounterQuery,
  solidThingToSimpleCounter,
  solidThingToSimpleCounterRecord,
} from './solid-simple-counter.mapper';
import { SolidRuntimeService } from './solid-runtime.service';

type SolidSimpleCounterContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidSimpleCounterRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadSimpleCounters(): Promise<SimpleCounter[]> {
    const simpleCounterContainerScope = this.simpleCounterContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [simpleCounterContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidSimpleCounterQuery, {
      scope: simpleCounterContainerScope,
      autoDiscover: true,
    });

    return result.things
      .map(solidThingToSimpleCounterRecord)
      .sort((a, b) => a.order - b.order)
      .map((record) => record.simpleCounter);
  }

  async saveSimpleCounter(
    simpleCounter: SimpleCounter,
    order = 0,
  ): Promise<SimpleCounter> {
    const existingThing = await this.findSimpleCounterThing(simpleCounter.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        simpleCounterToSolidCreateInput(
          simpleCounter,
          this.solidRuntime.simpleCounterProfile,
          order,
        ),
      );
      return solidThingToSimpleCounter(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      simpleCounterToSolidChanges(simpleCounter, order),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid simple counter update commit, received ${commit.kind}`,
      );
    }

    return solidThingToSimpleCounter(commit.result);
  }

  async deleteSimpleCounter(simpleCounterId: string): Promise<void> {
    const existingThing = await this.findSimpleCounterThing(simpleCounterId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeSimpleCounters(
    listener: (simpleCounters: SimpleCounter[]) => void,
  ): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidSimpleCounterQuery,
      (result) =>
        listener(
          result.things
            .map(solidThingToSimpleCounterRecord)
            .sort((a, b) => a.order - b.order)
            .map((record) => record.simpleCounter),
        ),
      {
        emitInitial: true,
      },
    );
  }

  private async findSimpleCounterThing(simpleCounterId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidSimpleCounterQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_SIMPLE_COUNTER.id,
            value: simpleCounterId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.simpleCounterContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private simpleCounterContainerScope(): SolidSimpleCounterContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.simpleCounters,
    };
  }
}
