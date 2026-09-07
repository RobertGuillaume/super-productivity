import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { MenuTreeKind, MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import { updateProjectTree } from '../features/menu-tree/store/menu-tree.actions';
import { selectMenuTreeState } from '../features/menu-tree/store/menu-tree.selectors';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { addTag, deleteTag } from '../features/tag/store/tag.actions';
import { DEFAULT_TASK } from '../features/tasks/task.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidMenuTreePersistenceEffects } from './solid-menu-tree-persistence.effects';
import { SolidMenuTreeRepository } from './solid-menu-tree.repository';

describe('SolidMenuTreePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidMenuTreeRepository: jasmine.SpyObj<SolidMenuTreeRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const menuTree: MenuTreeState = {
    projectTree: [
      {
        id: 'project-1',
        k: MenuTreeKind.PROJECT,
      },
    ],
    tagTree: [
      {
        id: 'tag-1',
        k: MenuTreeKind.TAG,
      },
    ],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidMenuTreeRepository = jasmine.createSpyObj<SolidMenuTreeRepository>(
      'SolidMenuTreeRepository',
      ['saveMenuTree'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidMenuTreePersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidMenuTreeRepository, useValue: solidMenuTreeRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists direct menu tree actions from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMenuTreeRepository.saveMenuTree.and.resolveTo(menuTree);
    store.select.and.callFake((selector) =>
      selector === selectMenuTreeState ? of(menuTree) : of(null),
    );
    const effects = TestBed.inject(SolidMenuTreePersistenceEffects);
    const subscription = effects.persistMenuTree$.subscribe();

    actions$.next(
      updateProjectTree({
        tree: [],
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectMenuTreeState],
    ]);
    expect(solidMenuTreeRepository.saveMenuTree).toHaveBeenCalledOnceWith(menuTree);
    subscription.unsubscribe();
  });

  it('persists menu tree after tag tree mutations from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMenuTreeRepository.saveMenuTree.and.resolveTo(menuTree);
    store.select.and.returnValue(of(menuTree));
    const effects = TestBed.inject(SolidMenuTreePersistenceEffects);
    const subscription = effects.persistMenuTree$.subscribe();

    actions$.next(
      addTag({
        tag: {
          ...DEFAULT_TAG,
          id: 'tag-1',
        },
      }),
    );
    await Promise.resolve();
    actions$.next(deleteTag({ id: 'tag-1' }));
    await Promise.resolve();

    expect(solidMenuTreeRepository.saveMenuTree.calls.allArgs()).toEqual([
      [menuTree],
      [menuTree],
    ]);
    subscription.unsubscribe();
  });

  it('persists menu tree after project delete cascades from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidMenuTreeRepository.saveMenuTree.and.resolveTo(menuTree);
    store.select.and.returnValue(of(menuTree));
    const effects = TestBed.inject(SolidMenuTreePersistenceEffects);
    const subscription = effects.persistMenuTree$.subscribe();

    actions$.next(
      TaskSharedActions.deleteProject({
        projectId: 'project-1',
        noteIds: [],
        allTaskIds: [DEFAULT_TASK.id],
      }),
    );
    await Promise.resolve();

    expect(solidMenuTreeRepository.saveMenuTree).toHaveBeenCalledOnceWith(menuTree);
    subscription.unsubscribe();
  });

  it('ignores remote menu tree actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidMenuTreePersistenceEffects);
    const subscription = effects.persistMenuTree$.subscribe();

    actions$.next({
      ...updateProjectTree({
        tree: menuTree.projectTree,
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidMenuTreeRepository.saveMenuTree).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
