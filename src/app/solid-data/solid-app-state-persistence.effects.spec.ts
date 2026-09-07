import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { updateNoteOrder } from '../features/note/store/note.actions';
import { selectNoteTodayOrder } from '../features/note/store/note.reducer';
import { DEFAULT_PROJECT, INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { updateProjectOrder } from '../features/project/store/project.actions';
import {
  selectProjectById,
  selectProjectFeatureState,
} from '../features/project/store/project.selectors';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { updateTagOrder } from '../features/tag/store/tag.actions';
import { selectTagFeatureState } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidAppStatePersistenceEffects } from './solid-app-state-persistence.effects';
import { SolidAppStateRepository } from './solid-app-state.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';

describe('SolidAppStatePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidAppStateRepository: jasmine.SpyObj<SolidAppStateRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidAppStateRepository = jasmine.createSpyObj<SolidAppStateRepository>(
      'SolidAppStateRepository',
      ['saveAppStateOrder'],
    );
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidProjectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['saveProject'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidAppStatePersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidAppStateRepository, useValue: solidAppStateRepository },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists project order from the full post-reducer project state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidAppStateRepository.saveAppStateOrder.and.resolveTo({
      id: 'super-productivity-app-state',
      projectOrder: ['project-2', 'project-1'],
      sectionOrder: [],
      tagOrder: [],
      noteTodayOrder: [],
      updated: 1710000000000,
    });
    store.select.and.returnValue(
      of({
        ids: [INBOX_PROJECT.id, 'project-2', 'project-1'],
        entities: {},
      }),
    );
    const effects = TestBed.inject(SolidAppStatePersistenceEffects);
    const subscription = effects.persistProjectOrder$.subscribe();

    actions$.next(updateProjectOrder({ ids: ['project-2', 'project-1'] }));
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectFeatureState,
    ]);
    expect(solidAppStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      projectOrder: ['project-2', 'project-1'],
    });
    subscription.unsubscribe();
  });

  it('persists tag order from the full post-reducer tag state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidAppStateRepository.saveAppStateOrder.and.resolveTo({
      id: 'super-productivity-app-state',
      projectOrder: [],
      sectionOrder: [],
      tagOrder: [TODAY_TAG.id, 'tag-2', 'tag-1'],
      noteTodayOrder: [],
      updated: 1710000000000,
    });
    store.select.and.returnValue(
      of({
        ids: [TODAY_TAG.id, 'tag-2', 'tag-1'],
        entities: {
          [TODAY_TAG.id]: TODAY_TAG,
          ['tag-1']: { ...DEFAULT_TAG, id: 'tag-1' },
          ['tag-2']: { ...DEFAULT_TAG, id: 'tag-2' },
        },
      }),
    );
    const effects = TestBed.inject(SolidAppStatePersistenceEffects);
    const subscription = effects.persistTagOrder$.subscribe();

    actions$.next(updateTagOrder({ ids: [TODAY_TAG.id, 'tag-2', 'tag-1'] }));
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagFeatureState,
    ]);
    expect(solidAppStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      tagOrder: [TODAY_TAG.id, 'tag-2', 'tag-1'],
    });
    subscription.unsubscribe();
  });

  it('persists Today note order to app state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidAppStateRepository.saveAppStateOrder.and.resolveTo({
      id: 'super-productivity-app-state',
      projectOrder: [],
      sectionOrder: [],
      tagOrder: [],
      noteTodayOrder: ['note-2', 'note-1'],
      updated: 1710000000000,
    });
    store.select.and.returnValue(of(['note-2', 'note-1']));
    const effects = TestBed.inject(SolidAppStatePersistenceEffects);
    const subscription = effects.persistNoteOrder$.subscribe();

    actions$.next(
      updateNoteOrder({
        ids: ['note-2', 'note-1'],
        activeContextType: WorkContextType.TAG,
        activeContextId: TODAY_TAG.id,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectNoteTodayOrder,
    ]);
    expect(solidAppStateRepository.saveAppStateOrder).toHaveBeenCalledOnceWith({
      noteTodayOrder: ['note-2', 'note-1'],
    });
    subscription.unsubscribe();
  });

  it('persists project note order by saving the post-reducer project', async () => {
    const project: Project = {
      ...DEFAULT_PROJECT,
      id: 'project-1',
      noteIds: ['note-2', 'note-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(project);
    store.select.and.returnValue(of(project));
    const effects = TestBed.inject(SolidAppStatePersistenceEffects);
    const subscription = effects.persistNoteOrder$.subscribe();

    actions$.next(
      updateNoteOrder({
        ids: ['note-2', 'note-1'],
        activeContextType: WorkContextType.PROJECT,
        activeContextId: 'project-1',
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectProjectById,
      {
        id: 'project-1',
      },
    ]);
    expect(solidProjectRepository.saveProject).toHaveBeenCalledOnceWith(project);
    expect(solidAppStateRepository.saveAppStateOrder).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
