import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Note } from '../features/note/note.model';
import {
  addNote,
  deleteNote,
  moveNoteToOtherProject,
  updateNote,
} from '../features/note/store/note.actions';
import { selectNoteById } from '../features/note/store/note.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { SolidNoteRepository } from './solid-note.repository';

type SolidNoteUpdateAction =
  | ReturnType<typeof updateNote>
  | ReturnType<typeof moveNoteToOtherProject>;

@Injectable()
export class SolidNotePersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidNoteRepository = inject(SolidNoteRepository);
  private readonly snackService = inject(SnackService);

  persistNoteCreate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof addNote> & PersistentAction =>
            action.type === ActionType.NOTE_ADD &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidNoteRepository.saveNote(action.note)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistNoteUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidNoteUpdateAction & PersistentAction =>
            isSolidNoteUpdateAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store
            .select(selectNoteById, { id: this.noteIdForUpdateAction(action) })
            .pipe(
              take(1),
              filter((note): note is Note => !!note),
              concatMap((note) => from(this.solidNoteRepository.saveNote(note))),
              catchError((error) => this.handlePersistenceError(error)),
            ),
        ),
      ),
    { dispatch: false },
  );

  persistNoteDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof deleteNote> & PersistentAction =>
            action.type === ActionType.NOTE_DELETE &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidNoteRepository.deleteNote(action.id)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private noteIdForUpdateAction(action: SolidNoteUpdateAction): string {
    return action.note.id as string;
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidNotePersistenceEffects: failed to persist note change',
    });
  }
}

const SOLID_NOTE_UPDATE_ACTION_TYPES = new Set<string>([
  ActionType.NOTE_UPDATE,
  ActionType.NOTE_MOVE_TO_PROJECT,
]);

const isSolidNoteUpdateAction = (action: unknown): action is SolidNoteUpdateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_NOTE_UPDATE_ACTION_TYPES.has((action as { type: string }).type);
