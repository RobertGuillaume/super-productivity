import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Tag } from '../features/tag/tag.model';
import { SP_TAG } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidWriteQueueService } from './solid-write-queue.service';
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
  private readonly writeQueue = inject(SolidWriteQueueService);

  async loadTags(): Promise<Tag[]> {
    const tagContainerScope = this.tagContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [tagContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidTagQuery, {
      scope: tagContainerScope,
      autoDiscover: true,
    });

    return result.things.map(solidThingToTag);
  }

  saveTag(tag: Tag): Promise<Tag> {
    return this.writeQueue.enqueue(() => this.saveTagNow(tag));
  }

  deleteTag(tagId: string): Promise<void> {
    return this.writeQueue.enqueue(() => this.deleteTagNow(tagId));
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
        autoDiscover: true,
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
