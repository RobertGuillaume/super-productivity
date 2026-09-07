import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import {
  addTag,
  deleteTag,
  deleteTags,
  updateAdvancedConfigForTag,
  updateTag,
} from '../features/tag/store/tag.actions';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTagPersistenceEffects } from './solid-tag-persistence.effects';
import { SolidTagRepository } from './solid-tag.repository';

describe('SolidTagPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Persist tag to Solid',
    created: 1710000000000,
    taskIds: ['task-1'],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'deleteTag',
      'saveTag',
    ]);
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidTagPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidTagRepository, useValue: solidTagRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists tag creates to Solid when the Solid data layer owns the action', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(tag);
    const effects = TestBed.inject(SolidTagPersistenceEffects);
    const subscription = effects.persistTagCreate$.subscribe();

    actions$.next(addTag({ tag }));
    await Promise.resolve();

    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(snackService.open).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists tag updates with the full post-reducer tag', async () => {
    const updatedTag: Tag = {
      ...tag,
      title: 'Updated in store',
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(updatedTag);
    store.select.and.returnValue(of(updatedTag));
    const effects = TestBed.inject(SolidTagPersistenceEffects);
    const subscription = effects.persistTagUpdate$.subscribe();

    actions$.next(
      updateTag({
        tag: {
          id: tag.id,
          changes: {
            title: updatedTag.title,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: 'tag-1',
      },
    ]);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(updatedTag);
    subscription.unsubscribe();
  });

  it('persists advanced config updates with the full post-reducer tag', async () => {
    const updatedTag: Tag = {
      ...tag,
      advancedCfg: {
        ...tag.advancedCfg,
      },
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(updatedTag);
    store.select.and.returnValue(of(updatedTag));
    const effects = TestBed.inject(SolidTagPersistenceEffects);
    const subscription = effects.persistTagUpdate$.subscribe();

    actions$.next(
      updateAdvancedConfigForTag({
        tagId: tag.id,
        sectionKey: 'worklogExportSettings',
        data: {},
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: 'tag-1',
      },
    ]);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(updatedTag);
    subscription.unsubscribe();
  });

  it('persists single tag deletes to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.deleteTag.and.resolveTo();
    const effects = TestBed.inject(SolidTagPersistenceEffects);
    const subscription = effects.persistTagDelete$.subscribe();

    actions$.next(deleteTag({ id: 'tag-1' }));
    await Promise.resolve();

    expect(solidTagRepository.deleteTag).toHaveBeenCalledOnceWith('tag-1');
    subscription.unsubscribe();
  });

  it('persists bulk tag deletes to Solid', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.deleteTag.and.resolveTo();
    const effects = TestBed.inject(SolidTagPersistenceEffects);
    const subscription = effects.persistTagDelete$.subscribe();

    actions$.next(deleteTags({ ids: ['tag-1', 'tag-2'] }));
    await Promise.resolve();

    expect(solidTagRepository.deleteTag).toHaveBeenCalledWith('tag-1');
    expect(solidTagRepository.deleteTag).toHaveBeenCalledWith('tag-2');
    expect(solidTagRepository.deleteTag).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });
});
