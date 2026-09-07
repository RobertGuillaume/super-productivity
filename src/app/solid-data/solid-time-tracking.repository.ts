import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing } from '@solid-intents/runtime';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { SP_TIME_TRACKING } from './solid-productivity-vocab';
import {
  solidThingToTimeTrackingEntry,
  solidTimeTrackingQuery,
  SolidTimeTrackingContextType,
  SolidTimeTrackingEntry,
  timeTrackingEntriesToState,
  timeTrackingEntryId,
  timeTrackingEntryToSolidChanges,
  timeTrackingEntryToSolidCreateInput,
  timeTrackingStateToEntries,
} from './solid-time-tracking.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidTimeTrackingContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTimeTrackingRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadTimeTrackingState(): Promise<TimeTrackingState> {
    const timeTrackingContainerScope = this.timeTrackingContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [timeTrackingContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidTimeTrackingQuery, {
      scope: timeTrackingContainerScope,
      autoDiscover: true,
    });
    const entries = result.things
      .map((thing) => solidThingToTimeTrackingEntry(thing))
      .filter((entry): entry is SolidTimeTrackingEntry => entry !== null);

    return timeTrackingEntriesToState(entries);
  }

  saveTimeTrackingEntry(entry: SolidTimeTrackingEntry): Promise<SolidTimeTrackingEntry> {
    return this.writeQueue.enqueue(() => this.saveTimeTrackingEntryNow(entry));
  }

  replaceTimeTrackingState(state: TimeTrackingState): Promise<void> {
    return this.writeQueue.enqueue(() => this.replaceTimeTrackingStateNow(state));
  }

  private async saveTimeTrackingEntryNow(
    entry: SolidTimeTrackingEntry,
  ): Promise<SolidTimeTrackingEntry> {
    const existingThing = await this.findTimeTrackingThing(
      entry.contextType,
      entry.contextId,
      entry.date,
    );

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        timeTrackingEntryToSolidCreateInput(entry, this.solidRuntime.timeTrackingProfile),
      );
      const createdEntry = solidThingToTimeTrackingEntry(created);
      if (!createdEntry) {
        throw new Error('Expected Solid time tracking create result');
      }
      return createdEntry;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      timeTrackingEntryToSolidChanges(entry),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid time tracking update commit, received ${commit.kind}`,
      );
    }

    const updatedEntry = solidThingToTimeTrackingEntry(commit.result);
    if (!updatedEntry) {
      throw new Error('Expected Solid time tracking update result');
    }
    return updatedEntry;
  }

  private async replaceTimeTrackingStateNow(state: TimeTrackingState): Promise<void> {
    const existingThings = await this.findAllTimeTrackingThings();
    const entries = timeTrackingStateToEntries(state);
    const desiredIds = new Set(entries.map((entry) => entry.id));

    await Promise.all(entries.map((entry) => this.saveTimeTrackingEntryNow(entry)));

    await Promise.all(
      existingThings
        .map((thing) => ({
          thing,
          entry: solidThingToTimeTrackingEntry(thing),
        }))
        .filter(({ entry }) => entry !== null && !desiredIds.has(entry.id))
        .map(({ thing }) => this.solidRuntime.client.things.delete(thing.uri)),
    );
  }

  private async findTimeTrackingThing(
    contextType: SolidTimeTrackingContextType,
    contextId: string,
    date: string,
  ): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidTimeTrackingQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_TIME_TRACKING.id,
            value: timeTrackingEntryId(contextType, contextId, date),
          },
        ],
      },
      {
        limit: 1,
        scope: this.timeTrackingContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private async findAllTimeTrackingThings(): Promise<Thing[]> {
    const result = await this.solidRuntime.client.things.query(solidTimeTrackingQuery, {
      scope: this.timeTrackingContainerScope(),
      autoDiscover: true,
    });

    return result.things;
  }

  private timeTrackingContainerScope(): SolidTimeTrackingContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.timeTracking,
    };
  }
}
