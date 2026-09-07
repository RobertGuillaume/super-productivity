import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, ThingQueryResult } from '@solid-intents/runtime';
import { SP_APP_STATE } from './solid-productivity-vocab';
import {
  appStateToSolidChanges,
  appStateToSolidCreateInput,
  createEmptySolidAppState,
  SOLID_APP_STATE_ID,
  SolidAppState,
  solidAppStateQuery,
  solidThingToAppState,
} from './solid-app-state.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidAppContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidAppStateRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);

  async loadAppState(): Promise<SolidRepositoryRead<SolidAppState | null>> {
    const result = await this.queryAppStateThing();
    const existingThing = result.things[0] ?? null;
    return solidRepositoryRead(
      existingThing === null ? null : solidThingToAppState(existingThing),
      result.metadata,
    );
  }

  saveAppStateOrder(
    changes: Partial<
      Pick<SolidAppState, 'noteTodayOrder' | 'projectOrder' | 'sectionOrder' | 'tagOrder'>
    >,
  ): Promise<SolidAppState> {
    return this.mutationCoordinator.run(solidMutationKey('appState', 'order'), () =>
      this.saveAppStateOrderNow(changes),
    );
  }

  private async saveAppStateOrderNow(
    changes: Partial<
      Pick<SolidAppState, 'noteTodayOrder' | 'projectOrder' | 'sectionOrder' | 'tagOrder'>
    >,
  ): Promise<SolidAppState> {
    const existingThing = await this.findAppStateThing();
    const existing = existingThing === null ? null : solidThingToAppState(existingThing);
    const nextAppState: SolidAppState = {
      ...(existing ?? createEmptySolidAppState()),
      ...changes,
      id: SOLID_APP_STATE_ID,
      updated: Date.now(),
    };

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        appStateToSolidCreateInput(nextAppState, this.solidRuntime.appStateProfile),
      );
      return solidThingToAppState(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      appStateToSolidChanges(nextAppState),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid app state update commit, received ${commit.kind}`);
    }

    return solidThingToAppState(commit.result);
  }

  private async findAppStateThing(): Promise<Thing | null> {
    const result = await this.queryAppStateThing();
    return result.things[0] ?? null;
  }

  private queryAppStateThing(): Promise<ThingQueryResult> {
    return this.solidRuntime.client.things.query(
      {
        ...solidAppStateQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_APP_STATE.id,
            value: SOLID_APP_STATE_ID,
          },
        ],
      },
      {
        limit: 1,
        scope: this.appContainerScope(),
        autoDiscover: false,
      },
    );
  }

  private appContainerScope(): SolidAppContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.app,
    };
  }
}
