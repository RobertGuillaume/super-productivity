import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Section } from '../features/section/section.model';
import { SP_SECTION } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import {
  sectionToSolidChanges,
  sectionToSolidCreateInput,
  solidSectionQuery,
  solidThingToSection,
} from './solid-section.mapper';

type SolidSectionContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidSectionRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);

  async loadSections(): Promise<SolidRepositoryRead<Section[]>> {
    const sectionContainerScope = this.sectionContainerScope();

    const result = await this.solidRuntime.client.things.query(solidSectionQuery, {
      scope: sectionContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(sectionContainerScope.uri, result.things)
        .map(solidThingToSection),
      result.metadata,
    );
  }

  saveSection(section: Section): Promise<Section> {
    return this.mutationCoordinator.run(solidMutationKey('section', section.id), () =>
      this.saveSectionNow(section),
    );
  }

  deleteSection(sectionId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('section', sectionId), () =>
      this.deleteSectionNow(sectionId),
    );
  }

  private async saveSectionNow(section: Section): Promise<Section> {
    const existingThing = await this.findSectionThing(section.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        sectionToSolidCreateInput(section, this.solidRuntime.sectionProfile),
      );
      return solidThingToSection(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      sectionToSolidChanges(section),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid section update commit, received ${commit.kind}`);
    }

    return solidThingToSection(commit.result);
  }

  private async deleteSectionNow(sectionId: string): Promise<void> {
    const existingThing = await this.findSectionThing(sectionId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeSections(listener: (sections: Section[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidSectionQuery,
      (result) => listener(result.things.map(solidThingToSection)),
      {
        emitInitial: true,
      },
    );
  }

  private async findSectionThing(sectionId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidSectionQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_SECTION.id,
            value: sectionId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.sectionContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private sectionContainerScope(): SolidSectionContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.sections,
    };
  }
}
