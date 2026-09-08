import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing } from '@solid-intents/runtime';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import {
  solidThingToTimeTrackingEntry,
  solidTimeTrackingQuery,
  SolidTimeTrackingEntry,
  timeTrackingEntriesToState,
  timeTrackingEntryResourceName,
  timeTrackingEntryToSolidChanges,
  timeTrackingEntryToSolidCreateInput,
  timeTrackingStateToEntries,
} from './solid-time-tracking.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  settleSolidMutations,
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';

type SolidTimeTrackingContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTimeTrackingRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadTimeTrackingState(): Promise<SolidRepositoryRead<TimeTrackingState>> {
    const timeTrackingContainerScope = this.timeTrackingContainerScope();

    const result = await this.solidRuntime.client.things.query(solidTimeTrackingQuery, {
      scope: timeTrackingContainerScope,
      autoDiscover: false,
    });
    const entries = this.catalogAuthority
      .filterThings(timeTrackingContainerScope.uri, result.things)
      .map((thing) => {
        const entry = solidThingToTimeTrackingEntry(thing);
        return entry === null
          ? null
          : this.operations.remember('timeTracking', entry.id, thing, entry);
      })
      .filter((entry): entry is SolidTimeTrackingEntry => entry !== null);

    return solidRepositoryRead(timeTrackingEntriesToState(entries), result.metadata);
  }

  saveTimeTrackingEntry(entry: SolidTimeTrackingEntry): Promise<SolidTimeTrackingEntry> {
    return this.mutationCoordinator.run(solidMutationKey('timeTracking', '*'), () =>
      this.saveTimeTrackingEntryNow(entry),
    );
  }

  replaceTimeTrackingState(state: TimeTrackingState): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('timeTracking', '*'), () =>
      this.replaceTimeTrackingStateNow(state),
    );
  }

  private async saveTimeTrackingEntryNow(
    entry: SolidTimeTrackingEntry,
  ): Promise<SolidTimeTrackingEntry> {
    return this.operations.upsert({
      model: 'timeTracking',
      id: entry.id,
      value: entry,
      resourceName: timeTrackingEntryResourceName(
        entry.contextType,
        entry.contextId,
        entry.date,
      ),
      profile: this.solidRuntime.timeTrackingProfile,
      createInput: timeTrackingEntryToSolidCreateInput(
        entry,
        this.solidRuntime.timeTrackingProfile,
      ),
      changes: timeTrackingEntryToSolidChanges(entry),
      map: (thing) => {
        const value = solidThingToTimeTrackingEntry(thing);
        if (value === null) {
          throw new Error('Expected Solid time tracking mutation result');
        }
        return value;
      },
    });
  }

  private async replaceTimeTrackingStateNow(state: TimeTrackingState): Promise<void> {
    const existingThings = await this.findAllTimeTrackingThings();
    const entries = timeTrackingStateToEntries(state);
    const desiredIds = new Set(entries.map((entry) => entry.id));

    await settleSolidMutations(
      entries.map((entry) => this.saveTimeTrackingEntryNow(entry)),
    );

    await settleSolidMutations(
      existingThings
        .map((thing) => ({
          thing,
          entry: solidThingToTimeTrackingEntry(thing),
        }))
        .filter(({ entry }) => entry !== null && !desiredIds.has(entry.id))
        .map(({ entry }) =>
          this.operations.delete(
            'timeTracking',
            entry!.id,
            this.solidRuntime.timeTrackingProfile,
            timeTrackingEntryResourceName(
              entry!.contextType,
              entry!.contextId,
              entry!.date,
            ),
          ),
        ),
    );
  }

  private async findAllTimeTrackingThings(): Promise<Thing[]> {
    const result = await this.solidRuntime.client.things.query(solidTimeTrackingQuery, {
      scope: this.timeTrackingContainerScope(),
      autoDiscover: false,
    });

    const things = this.catalogAuthority.filterThings(
      this.timeTrackingContainerScope().uri,
      result.things,
    );
    for (const thing of things) {
      const entry = solidThingToTimeTrackingEntry(thing);
      if (entry !== null) {
        this.operations.remember('timeTracking', entry.id, thing, entry);
      }
    }
    return things;
  }

  private timeTrackingContainerScope(): SolidTimeTrackingContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.timeTracking,
    };
  }
}
