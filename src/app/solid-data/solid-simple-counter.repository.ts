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
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidSimpleCounterContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidSimpleCounterRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadSimpleCounters(): Promise<SolidRepositoryRead<SimpleCounter[]>> {
    const simpleCounterContainerScope = this.simpleCounterContainerScope();

    const result = await this.solidRuntime.client.things.query(solidSimpleCounterQuery, {
      scope: simpleCounterContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things
        .map(solidThingToSimpleCounterRecord)
        .sort((a, b) => a.order - b.order)
        .map((record) => record.simpleCounter),
      result.metadata,
    );
  }

  saveSimpleCounter(simpleCounter: SimpleCounter, order = 0): Promise<SimpleCounter> {
    return this.writeQueue.enqueue(() => this.saveSimpleCounterNow(simpleCounter, order));
  }

  replaceSimpleCounters(
    simpleCounters: readonly SimpleCounter[],
  ): Promise<SimpleCounter[]> {
    return this.writeQueue.enqueue(() => this.replaceSimpleCountersNow(simpleCounters));
  }

  deleteSimpleCounter(simpleCounterId: string): Promise<void> {
    return this.writeQueue.enqueue(() => this.deleteSimpleCounterNow(simpleCounterId));
  }

  private async saveSimpleCounterNow(
    simpleCounter: SimpleCounter,
    order: number,
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

  private async replaceSimpleCountersNow(
    simpleCounters: readonly SimpleCounter[],
  ): Promise<SimpleCounter[]> {
    const existingThings = await this.querySimpleCounterThings();
    const nextIds = new Set(simpleCounters.map((simpleCounter) => simpleCounter.id));

    await Promise.all(
      existingThings
        .map(solidThingToSimpleCounter)
        .filter((simpleCounter) => !nextIds.has(simpleCounter.id))
        .map((simpleCounter) => this.deleteSimpleCounterNow(simpleCounter.id)),
    );

    return Promise.all(
      simpleCounters.map((simpleCounter, order) =>
        this.saveSimpleCounterNow(simpleCounter, order),
      ),
    );
  }

  private async deleteSimpleCounterNow(simpleCounterId: string): Promise<void> {
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
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private async querySimpleCounterThings(): Promise<Thing[]> {
    const result = await this.solidRuntime.client.things.query(solidSimpleCounterQuery, {
      scope: this.simpleCounterContainerScope(),
      autoDiscover: false,
    });

    return [...result.things];
  }

  private simpleCounterContainerScope(): SolidSimpleCounterContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.simpleCounters,
    };
  }
}
