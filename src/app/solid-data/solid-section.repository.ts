import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Section } from '../features/section/section.model';
import { SP_SECTION } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
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
  private readonly operations = inject(SolidRepositoryOperations);

  async loadSections(): Promise<SolidRepositoryRead<Section[]>> {
    const sectionContainerScope = this.sectionContainerScope();

    const result = await this.solidRuntime.client.things.query(solidSectionQuery, {
      scope: sectionContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(sectionContainerScope.uri, result.things)
        .map((thing) => {
          const section = solidThingToSection(thing);
          return this.operations.remember('section', section.id, thing, section);
        }),
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
    return this.operations.upsert({
      model: 'section',
      id: section.id,
      value: section,
      resourceName: section.id,
      profile: this.solidRuntime.sectionProfile,
      createInput: sectionToSolidCreateInput(section, this.solidRuntime.sectionProfile),
      changes: sectionToSolidChanges(section),
      map: solidThingToSection,
    });
  }

  private async deleteSectionNow(sectionId: string): Promise<void> {
    await this.operations.delete(
      'section',
      sectionId,
      this.solidRuntime.sectionProfile,
      sectionId,
    );
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
