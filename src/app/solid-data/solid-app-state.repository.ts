import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, ThingQueryResult } from '@solid-intents/runtime';
import { SP_APP_STATE } from './solid-productivity-vocab';
import {
  appStateToSolidChanges,
  appStateToSolidCreateInput,
  createEmptySolidAppState,
  SOLID_APP_STATE_ID,
  SOLID_APP_STATE_RESOURCE_NAME,
  SolidAppState,
  solidAppStateQuery,
  solidThingToAppState,
} from './solid-app-state.mapper';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';

type SolidAppContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidAppStateRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);
  private lastAppState: SolidAppState | null = null;

  async loadAppState(): Promise<SolidRepositoryRead<SolidAppState | null>> {
    const result = await this.queryAppStateThing();
    const existingThing =
      this.catalogAuthority.filterThings(
        this.appContainerScope().uri,
        result.things,
      )[0] ?? null;
    this.lastAppState =
      existingThing === null
        ? null
        : this.operations.remember(
            'appState',
            SOLID_APP_STATE_ID,
            existingThing,
            solidThingToAppState(existingThing),
          );
    return solidRepositoryRead(this.lastAppState, result.metadata);
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
    const nextAppState: SolidAppState = {
      ...(this.lastAppState ?? createEmptySolidAppState()),
      ...changes,
      id: SOLID_APP_STATE_ID,
      updated: Date.now(),
    };

    this.lastAppState = await this.operations.upsert({
      model: 'appState',
      id: SOLID_APP_STATE_ID,
      value: nextAppState,
      resourceName: SOLID_APP_STATE_RESOURCE_NAME,
      profile: this.solidRuntime.appStateProfile,
      createInput: appStateToSolidCreateInput(
        nextAppState,
        this.solidRuntime.appStateProfile,
      ),
      changes: appStateToSolidChanges(nextAppState),
      map: solidThingToAppState,
    });
    return this.lastAppState;
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
