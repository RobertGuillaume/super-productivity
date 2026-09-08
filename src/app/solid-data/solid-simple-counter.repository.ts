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
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  settleSolidMutations,
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidSimpleCounterContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidSimpleCounterRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadSimpleCounters(): Promise<SolidRepositoryRead<SimpleCounter[]>> {
    const simpleCounterContainerScope = this.simpleCounterContainerScope();

    const result = await this.solidRuntime.client.things.query(solidSimpleCounterQuery, {
      scope: simpleCounterContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(simpleCounterContainerScope.uri, result.things)
        .map((thing) => {
          const record = solidThingToSimpleCounterRecord(thing);
          return this.operations.remember(
            'simpleCounter',
            record.simpleCounter.id,
            thing,
            record,
          );
        })
        .sort((a, b) => a.order - b.order)
        .map((record) => record.simpleCounter),
      result.metadata,
    );
  }

  saveSimpleCounter(simpleCounter: SimpleCounter, order = 0): Promise<SimpleCounter> {
    return this.mutationCoordinator.run(solidMutationKey('simpleCounter', '*'), () =>
      this.saveSimpleCounterNow(simpleCounter, order),
    );
  }

  replaceSimpleCounters(
    simpleCounters: readonly SimpleCounter[],
  ): Promise<SimpleCounter[]> {
    return this.mutationCoordinator.run(solidMutationKey('simpleCounter', '*'), () =>
      this.replaceSimpleCountersNow(simpleCounters),
    );
  }

  deleteSimpleCounter(simpleCounterId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('simpleCounter', '*'), () =>
      this.deleteSimpleCounterNow(simpleCounterId),
    );
  }

  private async saveSimpleCounterNow(
    simpleCounter: SimpleCounter,
    order: number,
  ): Promise<SimpleCounter> {
    return this.operations.upsert({
      model: 'simpleCounter',
      id: simpleCounter.id,
      value: simpleCounter,
      resourceName: simpleCounter.id,
      profile: this.solidRuntime.simpleCounterProfile,
      createInput: simpleCounterToSolidCreateInput(
        simpleCounter,
        this.solidRuntime.simpleCounterProfile,
        order,
      ),
      changes: simpleCounterToSolidChanges(simpleCounter, order),
      map: solidThingToSimpleCounter,
    });
  }

  private async replaceSimpleCountersNow(
    simpleCounters: readonly SimpleCounter[],
  ): Promise<SimpleCounter[]> {
    const existingThings = await this.querySimpleCounterThings();
    const nextIds = new Set(simpleCounters.map((simpleCounter) => simpleCounter.id));

    await settleSolidMutations(
      existingThings
        .map(solidThingToSimpleCounter)
        .filter((simpleCounter) => !nextIds.has(simpleCounter.id))
        .map((simpleCounter) => this.deleteSimpleCounterNow(simpleCounter.id)),
    );

    return settleSolidMutations(
      simpleCounters.map((simpleCounter, order) =>
        this.saveSimpleCounterNow(simpleCounter, order),
      ),
    );
  }

  private async deleteSimpleCounterNow(simpleCounterId: string): Promise<void> {
    await this.operations.delete(
      'simpleCounter',
      simpleCounterId,
      this.solidRuntime.simpleCounterProfile,
      simpleCounterId,
    );
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

    return this.catalogAuthority
      .filterThings(this.simpleCounterContainerScope().uri, result.things)
      .map((thing) => {
        const simpleCounter = solidThingToSimpleCounter(thing);
        this.operations.remember('simpleCounter', simpleCounter.id, thing, simpleCounter);
        return thing;
      });
  }

  private simpleCounterContainerScope(): SolidSimpleCounterContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.simpleCounters,
    };
  }
}
