import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { IssueProvider, IssueProviderState } from '../features/issue/issue.model';
import { IssueProviderActions } from '../features/issue/store/issue-provider.actions';
import { selectIssueProviderState } from '../features/issue/store/issue-provider.selectors';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectTasksById } from '../features/tasks/store/task.selectors';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidIssueProviderPersistenceEffects } from './solid-issue-provider-persistence.effects';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidIssueProviderPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidIssueProviderRepository: jasmine.SpyObj<SolidIssueProviderRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const issueProvider: IssueProvider = {
    id: 'issue-provider-1',
    issueProviderKey: 'GITHUB',
    isEnabled: true,
    pluginId: 'github-issue-provider',
    pluginConfig: {
      repo: 'owner/repo',
    },
  };
  const secondIssueProvider: IssueProvider = {
    ...issueProvider,
    id: 'issue-provider-2',
  };
  const issueProviderState: IssueProviderState = {
    ids: ['issue-provider-2', 'issue-provider-1'],
    entities: {
      [issueProvider.id]: issueProvider,
      [secondIssueProvider.id]: secondIssueProvider,
    },
  };
  const unlinkedTask: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    projectId: 'project-1',
    issueId: undefined,
    issueProviderId: undefined,
    issueType: undefined,
    created: 1710000000000,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidIssueProviderRepository = jasmine.createSpyObj<SolidIssueProviderRepository>(
      'SolidIssueProviderRepository',
      ['saveIssueProvider', 'deleteIssueProvider'],
    );
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    TestBed.configureTestingModule({
      providers: [
        SolidIssueProviderPersistenceEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        {
          provide: SolidIssueProviderRepository,
          useValue: solidIssueProviderRepository,
        },
        { provide: SolidTaskRepository, useValue: solidTaskRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists issue provider updates from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidIssueProviderRepository.saveIssueProvider.and.resolveTo(issueProvider);
    store.select.and.callFake((selector) =>
      selector === selectIssueProviderState ? of(issueProviderState) : of([]),
    );
    const effects = TestBed.inject(SolidIssueProviderPersistenceEffects);
    const subscription = effects.persistIssueProviderSave$.subscribe();

    actions$.next(
      IssueProviderActions.updateIssueProvider({
        issueProvider: {
          id: 'issue-provider-1',
          changes: {
            isEnabled: false,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectIssueProviderState],
    ]);
    expect(solidIssueProviderRepository.saveIssueProvider).toHaveBeenCalledOnceWith(
      issueProvider,
      1,
    );
    subscription.unsubscribe();
  });

  it('persists provider order by saving all providers after sorting', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidIssueProviderRepository.saveIssueProvider.and.resolveTo(issueProvider);
    store.select.and.returnValue(of(issueProviderState));
    const effects = TestBed.inject(SolidIssueProviderPersistenceEffects);
    const subscription = effects.persistIssueProviderSave$.subscribe();

    actions$.next(
      IssueProviderActions.sortIssueProvidersFirst({
        ids: ['issue-provider-2'],
      }),
    );
    await Promise.resolve();

    expect(solidIssueProviderRepository.saveIssueProvider.calls.allArgs()).toEqual([
      [secondIssueProvider, 0],
      [issueProvider, 1],
    ]);
    subscription.unsubscribe();
  });

  it('deletes providers and persists unlinked tasks from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    solidIssueProviderRepository.deleteIssueProvider.and.resolveTo();
    solidTaskRepository.saveTask.and.resolveTo(unlinkedTask);
    store.select.and.callFake((selector) =>
      selector === selectTasksById ? of([unlinkedTask]) : of(issueProviderState),
    );
    const effects = TestBed.inject(SolidIssueProviderPersistenceEffects);
    const subscription = effects.persistIssueProviderDelete$.subscribe();

    actions$.next(
      TaskSharedActions.deleteIssueProvider({
        issueProviderId: 'issue-provider-1',
        taskIdsToUnlink: ['task-1'],
      }),
    );
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [
        selectTasksById,
        {
          ids: ['task-1'],
        },
      ],
    ]);
    expect(solidIssueProviderRepository.deleteIssueProvider).toHaveBeenCalledOnceWith(
      'issue-provider-1',
    );
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(unlinkedTask);
    subscription.unsubscribe();
  });

  it('ignores remote issue provider cleanup actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidIssueProviderPersistenceEffects);
    const subscription = effects.persistIssueProviderDelete$.subscribe();

    actions$.next({
      ...TaskSharedActions.deleteIssueProviders({
        ids: ['issue-provider-1'],
        taskIdsToUnlink: ['task-1'],
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidIssueProviderRepository.deleteIssueProvider).not.toHaveBeenCalled();
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
