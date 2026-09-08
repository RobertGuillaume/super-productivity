import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Tag } from '../features/tag/tag.model';
import { SP_TAG } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import {
  solidTagQuery,
  solidThingToTag,
  tagToSolidChanges,
  tagToSolidCreateInput,
} from './solid-tag.mapper';

type SolidTagContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidTagRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);

  async loadTags(): Promise<SolidRepositoryRead<Tag[]>> {
    const tagContainerScope = this.tagContainerScope();

    const result = await this.solidRuntime.client.things.query(solidTagQuery, {
      scope: tagContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(tagContainerScope.uri, result.things)
        .map(solidThingToTag),
      result.metadata,
    );
  }

  saveTag(tag: Tag): Promise<Tag> {
    return this.mutationCoordinator.run(solidMutationKey('tag', tag.id), () =>
      this.saveTagNow(tag),
    );
  }

  deleteTag(tagId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('tag', tagId), () =>
      this.deleteTagNow(tagId),
    );
  }

  private async saveTagNow(tag: Tag): Promise<Tag> {
    const existingThing = await this.findTagThing(tag.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        tagToSolidCreateInput(tag, this.solidRuntime.tagProfile),
      );
      return solidThingToTag(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      tagToSolidChanges(tag),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid tag update commit, received ${commit.kind}`);
    }

    return solidThingToTag(commit.result);
  }

  private async deleteTagNow(tagId: string): Promise<void> {
    const existingThing = await this.findTagThing(tagId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeTags(listener: (tags: Tag[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidTagQuery,
      (result) => listener(result.things.map(solidThingToTag)),
      {
        emitInitial: true,
      },
    );
  }

  private async findTagThing(tagId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidTagQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_TAG.id,
            value: tagId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.tagContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private tagContainerScope(): SolidTagContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.tags,
    };
  }
}
