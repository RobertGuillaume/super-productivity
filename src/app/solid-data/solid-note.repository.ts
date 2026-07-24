import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Note } from '../features/note/note.model';
import { SP_NOTE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import {
  noteToSolidChanges,
  noteToSolidCreateInput,
  solidNoteQuery,
  solidThingToNote,
} from './solid-note.mapper';

type SolidNoteContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidNoteRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async loadNotes(): Promise<Note[]> {
    const noteContainerScope = this.noteContainerScope();

    await this.solidRuntime.client.discovery.start({
      entrypoints: [noteContainerScope.uri],
      mode: 'balanced',
    });

    const result = await this.solidRuntime.client.things.query(solidNoteQuery, {
      scope: noteContainerScope,
      autoDiscover: true,
    });

    return result.things.map(solidThingToNote);
  }

  async saveNote(note: Note): Promise<Note> {
    const existingThing = await this.findNoteThing(note.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        noteToSolidCreateInput(note, this.solidRuntime.noteProfile),
      );
      return solidThingToNote(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      noteToSolidChanges(note),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid note update commit, received ${commit.kind}`);
    }

    return solidThingToNote(commit.result);
  }

  async deleteNote(noteId: string): Promise<void> {
    const existingThing = await this.findNoteThing(noteId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeNotes(listener: (notes: Note[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidNoteQuery,
      (result) => listener(result.things.map(solidThingToNote)),
      {
        emitInitial: true,
      },
    );
  }

  private async findNoteThing(noteId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidNoteQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_NOTE.id,
            value: noteId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.noteContainerScope(),
        autoDiscover: true,
      },
    );

    return result.things[0] ?? null;
  }

  private noteContainerScope(): SolidNoteContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.notes,
    };
  }
}
