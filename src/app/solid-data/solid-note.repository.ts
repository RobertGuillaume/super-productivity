import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Note } from '../features/note/note.model';
import { SP_NOTE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidRepositoryOperations } from './solid-repository-operations.service';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
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
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadNotes(): Promise<SolidRepositoryRead<Note[]>> {
    const noteContainerScope = this.noteContainerScope();

    const result = await this.solidRuntime.client.things.query(solidNoteQuery, {
      scope: noteContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      result.things.map((thing) => {
        const note = solidThingToNote(thing);
        return this.operations.remember('note', note.id, thing, note);
      }),
      result.metadata,
    );
  }

  saveNote(note: Note): Promise<Note> {
    return this.mutationCoordinator.run(solidMutationKey('note', note.id), () =>
      this.saveNoteNow(note),
    );
  }

  deleteNote(noteId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('note', noteId), () =>
      this.deleteNoteNow(noteId),
    );
  }

  private async saveNoteNow(note: Note): Promise<Note> {
    return this.operations.upsert({
      model: 'note',
      id: note.id,
      value: note,
      resourceName: note.id,
      profile: this.solidRuntime.noteProfile,
      createInput: noteToSolidCreateInput(note, this.solidRuntime.noteProfile),
      changes: noteToSolidChanges(note),
      map: solidThingToNote,
    });
  }

  private async deleteNoteNow(noteId: string): Promise<void> {
    await this.operations.delete('note', noteId, this.solidRuntime.noteProfile, noteId);
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
        autoDiscover: false,
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
