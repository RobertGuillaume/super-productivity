import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing } from '@solid-intents/runtime';
import { ArchiveModel } from '../features/archive/archive.model';
import { initialTimeTrackingState } from '../features/time-tracking/store/time-tracking.reducer';
import { SP_ARCHIVE_STATE } from './solid-productivity-vocab';
import {
  archiveStateToSolidChanges,
  archiveStateToSolidCreateInput,
  archiveStateResourceName,
  createDefaultSolidArchiveState,
  SolidArchiveState,
  SolidArchiveStateBucket,
  solidArchiveStateQuery,
  solidThingToArchiveState,
} from './solid-archive-state.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidArchiveStateContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidArchiveStateRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadArchiveStates(): Promise<
    SolidRepositoryRead<{
      young: SolidArchiveState;
      old: SolidArchiveState;
    }>
  > {
    const archiveStateContainerScope = this.archiveStateContainerScope();

    const result = await this.solidRuntime.client.things.query(solidArchiveStateQuery, {
      scope: archiveStateContainerScope,
      autoDiscover: false,
    });
    const states = this.catalogAuthority
      .filterThings(archiveStateContainerScope.uri, result.things)
      .map((thing) => {
        const state = solidThingToArchiveState(thing);
        return state === null
          ? null
          : this.operations.remember('archiveState', state.bucket, thing, state);
      })
      .filter((state): state is SolidArchiveState => state !== null);

    return solidRepositoryRead(
      {
        young:
          states.find((archiveState) => archiveState.bucket === 'young') ??
          createDefaultSolidArchiveState('young'),
        old:
          states.find((archiveState) => archiveState.bucket === 'old') ??
          createDefaultSolidArchiveState('old'),
      },
      result.metadata,
    );
  }

  saveArchiveState(archiveState: SolidArchiveState): Promise<SolidArchiveState> {
    return this.mutationCoordinator.run(
      solidMutationKey('archiveState', archiveState.bucket),
      () => this.saveArchiveStateNow(archiveState),
    );
  }

  private async saveArchiveStateNow(
    archiveState: SolidArchiveState,
  ): Promise<SolidArchiveState> {
    return this.operations.upsert({
      model: 'archiveState',
      id: archiveState.bucket,
      value: archiveState,
      resourceName: archiveStateResourceName(archiveState.bucket),
      profile: this.solidRuntime.archiveStateProfile,
      createInput: archiveStateToSolidCreateInput(
        archiveState,
        this.solidRuntime.archiveStateProfile,
      ),
      changes: archiveStateToSolidChanges(archiveState),
      map: (thing) => {
        const mapped = solidThingToArchiveState(thing);
        if (mapped === null) {
          throw new Error('Expected Solid archive state result');
        }
        return mapped;
      },
    });
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
        autoDiscover: false,
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
