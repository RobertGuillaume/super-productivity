import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing } from '@solid-intents/runtime';
import { ArchiveModel } from '../features/archive/archive.model';
import { initialTimeTrackingState } from '../features/time-tracking/store/time-tracking.reducer';
import { SP_ARCHIVE_STATE } from './solid-productivity-vocab';
import {
  archiveStateToSolidChanges,
  archiveStateToSolidCreateInput,
  createDefaultSolidArchiveState,
  SolidArchiveState,
  SolidArchiveStateBucket,
  solidArchiveStateQuery,
  solidThingToArchiveState,
} from './solid-archive-state.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidWriteQueueService } from './solid-write-queue.service';

type SolidArchiveStateContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidArchiveStateRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadArchiveStates(): Promise<{
    young: SolidArchiveState;
    old: SolidArchiveState;
  }> {
    const archiveStateContainerScope = this.archiveStateContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [archiveStateContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidArchiveStateQuery, {
      scope: archiveStateContainerScope,
      autoDiscover: true,
    });
    const states = result.things
      .map((thing) => solidThingToArchiveState(thing))
      .filter((state): state is SolidArchiveState => state !== null);

    return {
      young:
        states.find((archiveState) => archiveState.bucket === 'young') ??
        createDefaultSolidArchiveState('young'),
      old:
        states.find((archiveState) => archiveState.bucket === 'old') ??
        createDefaultSolidArchiveState('old'),
    };
  }

  saveArchiveState(archiveState: SolidArchiveState): Promise<SolidArchiveState> {
    return this.writeQueue.enqueue(() => this.saveArchiveStateNow(archiveState));
  }

  private async saveArchiveStateNow(
    archiveState: SolidArchiveState,
  ): Promise<SolidArchiveState> {
    const existingThing = await this.findArchiveStateThing(archiveState.bucket);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        archiveStateToSolidCreateInput(
          archiveState,
          this.solidRuntime.archiveStateProfile,
        ),
      );
      const createdArchiveState = solidThingToArchiveState(created);
      if (!createdArchiveState) {
        throw new Error('Expected Solid archive state create result');
      }
      return createdArchiveState;
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      archiveStateToSolidChanges(archiveState),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(
        `Expected Solid archive state update commit, received ${commit.kind}`,
      );
    }

    const updatedArchiveState = solidThingToArchiveState(commit.result);
    if (!updatedArchiveState) {
      throw new Error('Expected Solid archive state update result');
    }
    return updatedArchiveState;
  }

  archiveModelToSolidArchiveState(
    bucket: SolidArchiveStateBucket,
    archiveModel: ArchiveModel | undefined,
  ): SolidArchiveState {
    const fallback = createDefaultSolidArchiveState(bucket);
    return {
      ...fallback,
      timeTracking: archiveModel?.timeTracking ?? initialTimeTrackingState,
      lastTimeTrackingFlush: archiveModel?.lastTimeTrackingFlush ?? 0,
      updated: Date.now(),
    };
  }

  private async findArchiveStateThing(
    bucket: SolidArchiveStateBucket,
  ): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidArchiveStateQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_ARCHIVE_STATE.bucket,
            value: bucket,
          },
        ],
      },
      {
        limit: 1,
        scope: this.archiveStateContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private archiveStateContainerScope(): SolidArchiveStateContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.archiveState,
    };
  }
}
