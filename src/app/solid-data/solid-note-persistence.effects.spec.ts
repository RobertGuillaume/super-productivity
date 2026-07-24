import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { Note } from '../features/note/note.model';
import {
  addNote,
  deleteNote,
  moveNoteToOtherProject,
  updateNote,
} from '../features/note/store/note.actions';
import { selectNoteById } from '../features/note/store/note.reducer';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidNotePersistenceEffects } from './solid-note-persistence.effects';
import { SolidNoteRepository } from './solid-note.repository';

describe('SolidNotePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidNoteRepository: jasmine.SpyObj<SolidNoteRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  const note: Note = {
    id: 'note-1',
    projectId: 'project-1',
    isPinnedToToday: false,
    content: 'Persist note to Solid',
    created: 1710000000000,
    modified: 1710000000100,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidNoteRepository = jasmine.createSpyObj<SolidNoteRepository>(
      'SolidNoteRepository',
      ['deleteNote', 'saveNote'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidNotePersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidNoteRepository, useValue: solidNoteRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists note creates to Solid when the Solid data layer owns the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidNoteRepository.saveNote.and.resolveTo(note);
    const effects = TestBed.inject(SolidNotePersistenceEffects);
    const subscription = effects.persistNoteCreate$.subscribe();

    actions$.next(addNote({ note }));
    await Promise.resolve();

    expect(solidNoteRepository.saveNote).toHaveBeenCalledOnceWith(note);
    expect(snackService.open).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists note updates with the full post-reducer note', async () => {
    const updatedNote: Note = {
      ...note,
      content: 'Updated in store',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidNoteRepository.saveNote.and.resolveTo(updatedNote);
    store.select.and.returnValue(of(updatedNote));
    const effects = TestBed.inject(SolidNotePersistenceEffects);
    const subscription = effects.persistNoteUpdate$.subscribe();

    actions$.next(
      updateNote({
        note: {
          id: note.id,
          changes: {
            content: updatedNote.content,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectNoteById,
      {
        id: 'note-1',
      },
    ]);
    expect(solidNoteRepository.saveNote).toHaveBeenCalledOnceWith(updatedNote);
    subscription.unsubscribe();
  });

  it('persists note moves with the full post-reducer note', async () => {
    const movedNote: Note = {
      ...note,
      projectId: 'project-2',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidNoteRepository.saveNote.and.resolveTo(movedNote);
    store.select.and.returnValue(of(movedNote));
    const effects = TestBed.inject(SolidNotePersistenceEffects);
    const subscription = effects.persistNoteUpdate$.subscribe();

    actions$.next(
      moveNoteToOtherProject({
        note,
        targetProjectId: 'project-2',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectNoteById,
      {
        id: 'note-1',
      },
    ]);
    expect(solidNoteRepository.saveNote).toHaveBeenCalledOnceWith(movedNote);
    subscription.unsubscribe();
  });

  it('persists note deletes to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidNoteRepository.deleteNote.and.resolveTo();
    const effects = TestBed.inject(SolidNotePersistenceEffects);
    const subscription = effects.persistNoteDelete$.subscribe();

    actions$.next(
      deleteNote({
        id: 'note-1',
        projectId: 'project-1',
        isPinnedToToday: false,
      }),
    );
    await Promise.resolve();

    expect(solidNoteRepository.deleteNote).toHaveBeenCalledOnceWith('note-1');
    subscription.unsubscribe();
  });
});
