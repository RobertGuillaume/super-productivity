import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { ArchiveDbAdapter } from '../core/persistence/archive-db-adapter.service';
import { SnackService } from '../core/snack/snack.service';
import { ArchiveModel } from '../features/archive/archive.model';
import {
  archiveOperationHandled,
  compressArchive,
  flushYoungToOld,
} from '../features/archive/store/archive.actions';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectTimeTrackingState } from '../features/time-tracking/store/time-tracking.selectors';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidArchiveState } from './solid-archive-state.mapper';
import { SolidArchiveStatePersistenceEffects } from './solid-archive-state-persistence.effects';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';

describe('SolidArchiveStatePersistenceEffects', () => {
  let actions$: Subject<Action>;
  let archiveDbAdapter: jasmine.SpyObj<ArchiveDbAdapter>;
  let archiveStateRepository: jasmine.SpyObj<SolidArchiveStateRepository>;
  let archivedTaskRepository: jasmine.SpyObj<SolidArchivedTaskRepository>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;
  let timeTrackingRepository: jasmine.SpyObj<SolidTimeTrackingRepository>;

  const youngTask: Task = {
    ...DEFAULT_TASK,
    id: 'young-task',
    title: 'Young archived task',
    projectId: 'project-1',
    created: 1710000000000,
    isDone: true,
  };
  const oldTask: Task = {
    ...DEFAULT_TASK,
    id: 'old-task',
    title: 'Old archived task',
    projectId: 'project-1',
    created: 1700000000000,
    isDone: true,
  };
  const activeTimeTrackingState: TimeTrackingState = {
    project: {
      ['project-1']: {
        ['2026-08-04']: {
          s: 1710000000000,
          e: 1710003600000,
        },
      },
    },
    tag: {},
  };
  const archiveYoung: ArchiveModel = {
    task: {
      ids: ['young-task'],
      entities: {
        ['young-task']: youngTask,
      },
    },
    timeTracking: {
      project: {
        ['project-1']: {
          ['2026-07-01']: {
            s: 1709000000000,
          },
        },
      },
      tag: {},
    },
    lastTimeTrackingFlush: 1710000000000,
  };
  const archiveOld: ArchiveModel = {
    task: {
      ids: ['old-task'],
      entities: {
        ['old-task']: oldTask,
      },
    },
    timeTracking: {
      project: {},
      tag: {
        ['tag-1']: {
          ['2026-01-01']: {
            e: 1700000000000,
          },
        },
      },
    },
    lastTimeTrackingFlush: 1700000000000,
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    archiveDbAdapter = jasmine.createSpyObj<ArchiveDbAdapter>('ArchiveDbAdapter', [
      'loadArchiveYoung',
      'loadArchiveOld',
    ]);
    archiveStateRepository = jasmine.createSpyObj<SolidArchiveStateRepository>(
      'SolidArchiveStateRepository',
      ['archiveModelToSolidArchiveState', 'saveArchiveState'],
    );
    archivedTaskRepository = jasmine.createSpyObj<SolidArchivedTaskRepository>(
      'SolidArchivedTaskRepository',
      ['replaceArchivedTasks'],
    );
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);
    timeTrackingRepository = jasmine.createSpyObj<SolidTimeTrackingRepository>(
      'SolidTimeTrackingRepository',
      ['replaceTimeTrackingState'],
    );

    archiveDbAdapter.loadArchiveYoung.and.resolveTo(archiveYoung);
    archiveDbAdapter.loadArchiveOld.and.resolveTo(archiveOld);
    archiveStateRepository.archiveModelToSolidArchiveState.and.callFake(
      (bucket, archiveModel = archiveYoung) =>
        ({
          id: `archive-${bucket}`,
          bucket,
          timeTracking: archiveModel.timeTracking,
          lastTimeTrackingFlush: archiveModel.lastTimeTrackingFlush ?? 0,
          updated: 1710000000000,
        }) as SolidArchiveState,
    );
    archiveStateRepository.saveArchiveState.and.callFake(
      async (archiveState) => archiveState,
    );
    archivedTaskRepository.replaceArchivedTasks.and.resolveTo(undefined);
    timeTrackingRepository.replaceTimeTrackingState.and.resolveTo(undefined);
    store.select.and.callFake((selector: unknown) =>
      selector === selectTimeTrackingState ? of(activeTimeTrackingState) : of(null),
    );

    TestBed.configureTestingModule({
      providers: [
        SolidArchiveStatePersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: ArchiveDbAdapter, useValue: archiveDbAdapter },
        { provide: SolidArchiveStateRepository, useValue: archiveStateRepository },
        { provide: SolidArchivedTaskRepository, useValue: archivedTaskRepository },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidTimeTrackingRepository, useValue: timeTrackingRepository },
        { provide: SnackService, useValue: snackService },
        { provide: Store, useValue: store },
      ],
    });
  });

  afterEach(() => {
    actions$.complete();
    TestBed.resetTestingModule();
  });

  it('persists moveToArchive from post-operation archive cache and active time tracking', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidArchiveStatePersistenceEffects);
    const subscription = effects.persistArchiveState$.subscribe();

    actions$.next(
      TaskSharedActions.moveToArchive({
        tasks: [
          {
            ...youngTask,
            subTasks: [],
          },
        ],
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(store.select.calls.allArgs() as unknown as unknown[][]).toEqual([
      [selectTimeTrackingState],
    ]);
    expect(archiveDbAdapter.loadArchiveYoung).toHaveBeenCalledTimes(1);
    expect(archiveDbAdapter.loadArchiveOld).toHaveBeenCalledTimes(1);
    expect(archiveStateRepository.saveArchiveState.calls.allArgs()).toEqual([
      [jasmine.objectContaining({ bucket: 'young', id: 'archive-young' })],
      [jasmine.objectContaining({ bucket: 'old', id: 'archive-old' })],
    ]);
    expect(archivedTaskRepository.replaceArchivedTasks).toHaveBeenCalledOnceWith([
      {
        task: youngTask,
        bucket: 'young',
      },
      {
        task: oldTask,
        bucket: 'old',
      },
    ]);
    expect(timeTrackingRepository.replaceTimeTrackingState).toHaveBeenCalledOnceWith(
      activeTimeTrackingState,
    );
    subscription.unsubscribe();
  });

  it('persists flushYoungToOld from post-flush archive cache', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidArchiveStatePersistenceEffects);
    const subscription = effects.persistArchiveState$.subscribe();

    actions$.next(flushYoungToOld({ timestamp: 1710000000000 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(
      archiveStateRepository.archiveModelToSolidArchiveState.calls.allArgs(),
    ).toEqual([
      ['young', archiveYoung],
      ['old', archiveOld],
    ]);
    expect(archivedTaskRepository.replaceArchivedTasks).toHaveBeenCalledOnceWith([
      {
        task: youngTask,
        bucket: 'young',
      },
      {
        task: oldTask,
        bucket: 'old',
      },
    ]);
    expect(timeTrackingRepository.replaceTimeTrackingState).toHaveBeenCalledOnceWith(
      activeTimeTrackingState,
    );
    subscription.unsubscribe();
  });

  it('waits for archive maintenance actions to be handled before mirroring Solid archive state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const sourceAction = compressArchive({
      timestamp: 1710000000000,
      oneYearAgoTimestamp: 1678464000000,
    });
    const effects = TestBed.inject(SolidArchiveStatePersistenceEffects);
    const subscription = effects.persistArchiveState$.subscribe();

    actions$.next(sourceAction);
    await Promise.resolve();
    await Promise.resolve();

    expect(archiveDbAdapter.loadArchiveYoung).not.toHaveBeenCalled();
    expect(archivedTaskRepository.replaceArchivedTasks).not.toHaveBeenCalled();

    actions$.next(archiveOperationHandled({ sourceAction }));
    await Promise.resolve();
    await Promise.resolve();

    expect(archiveDbAdapter.loadArchiveYoung).toHaveBeenCalledTimes(1);
    expect(
      archiveStateRepository.archiveModelToSolidArchiveState.calls.allArgs(),
    ).toEqual([
      ['young', archiveYoung],
      ['old', archiveOld],
    ]);
    expect(archivedTaskRepository.replaceArchivedTasks).toHaveBeenCalledOnceWith([
      {
        task: youngTask,
        bucket: 'young',
      },
      {
        task: oldTask,
        bucket: 'old',
      },
    ]);
    subscription.unsubscribe();
  });

  it('ignores remote archive maintenance completion signals', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidArchiveStatePersistenceEffects);
    const subscription = effects.persistArchiveState$.subscribe();
    const sourceAction = compressArchive({
      timestamp: 1710000000000,
      oneYearAgoTimestamp: 1678464000000,
    });

    actions$.next(
      archiveOperationHandled({
        sourceAction: {
          ...sourceAction,
          meta: {
            ...sourceAction.meta,
            isRemote: true,
          },
        },
      }),
    );
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(archiveDbAdapter.loadArchiveYoung).not.toHaveBeenCalled();
    expect(archiveStateRepository.saveArchiveState).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('ignores remote archive state actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidArchiveStatePersistenceEffects);
    const subscription = effects.persistArchiveState$.subscribe();

    actions$.next({
      ...flushYoungToOld({ timestamp: 1710000000000 }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(archiveDbAdapter.loadArchiveYoung).not.toHaveBeenCalled();
    expect(archiveStateRepository.saveArchiveState).not.toHaveBeenCalled();
    expect(archivedTaskRepository.replaceArchivedTasks).not.toHaveBeenCalled();
    expect(timeTrackingRepository.replaceTimeTrackingState).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
