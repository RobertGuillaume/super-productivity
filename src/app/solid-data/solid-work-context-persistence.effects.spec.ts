import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { selectProjectById } from '../features/project/store/project.selectors';
import { DEFAULT_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { WorkContextType } from '../features/work-context/work-context.model';
import {
  moveTaskInTodayList,
  moveTaskToTopInTodayList,
} from '../features/work-context/store/work-context-meta.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidWorkContextPersistenceEffects } from './solid-work-context-persistence.effects';

describe('SolidWorkContextPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidProjectRepository: jasmine.SpyObj<SolidProjectRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidProjectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['saveProject'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidWorkContextPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidProjectRepository, useValue: solidProjectRepository },
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

  it('persists project task order moves with the full post-reducer project', async () => {
    const project: Project = {
      ...DEFAULT_PROJECT,
      id: 'project-1',
      taskIds: ['task-2', 'task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidProjectRepository.saveProject.and.resolveTo(project);
    store.select.and.returnValue(of(project));
    const effects = TestBed.inject(SolidWorkContextPersistenceEffects);
    const subscription = effects.persistWorkContextTaskOrder$.subscribe();

    actions$.next(
      moveTaskInTodayList({
        taskId: 'task-2',
        afterTaskId: null,
        workContextType: WorkContextType.PROJECT,
        workContextId: 'project-1',
        src: 'UNDONE',
        target: 'UNDONE',
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
    expect(solidTagRepository.saveTag).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists tag task order moves with the full post-reducer tag', async () => {
    const tag: Tag = {
      ...DEFAULT_TAG,
      id: 'tag-1',
      taskIds: ['task-2', 'task-1'],
    };
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidTagRepository.saveTag.and.resolveTo(tag);
    store.select.and.returnValue(of(tag));
    const effects = TestBed.inject(SolidWorkContextPersistenceEffects);
    const subscription = effects.persistWorkContextTaskOrder$.subscribe();

    actions$.next(
      moveTaskToTopInTodayList({
        taskId: 'task-2',
        workContextId: 'tag-1',
        doneTaskIds: [],
        workContextType: WorkContextType.TAG,
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.mostRecent().args as unknown[]).toEqual([
      selectTagById,
      {
        id: 'tag-1',
      },
    ]);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(tag);
    expect(solidProjectRepository.saveProject).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores work-context moves when the Solid data layer does not own them', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(false);
    const effects = TestBed.inject(SolidWorkContextPersistenceEffects);
    const subscription = effects.persistWorkContextTaskOrder$.subscribe();

    actions$.next(
      moveTaskToTopInTodayList({
        taskId: 'task-2',
        workContextId: 'tag-1',
        doneTaskIds: [],
        workContextType: WorkContextType.TAG,
      }),
    );
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidTagRepository.saveTag).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
