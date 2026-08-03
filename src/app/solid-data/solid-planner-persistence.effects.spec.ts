import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { SnackService } from '../core/snack/snack.service';
import { PlannerActions } from '../features/planner/store/planner.actions';
import { PlannerState } from '../features/planner/store/planner.reducer';
import { selectPlannerState } from '../features/planner/store/planner.selectors';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { selectAllTags } from '../features/tag/store/tag.reducer';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { selectAllTasks } from '../features/tasks/store/task.selectors';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidPlannerPersistenceEffects } from './solid-planner-persistence.effects';
import { SolidPlannerRepository } from './solid-planner.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidPlannerPersistenceEffects', () => {
  let actions$: Subject<Action>;
  let solidDataLayerState: jasmine.SpyObj<SolidDataLayerStateService>;
  let solidPlannerRepository: jasmine.SpyObj<SolidPlannerRepository>;
  let solidTagRepository: jasmine.SpyObj<SolidTagRepository>;
  let solidTaskRepository: jasmine.SpyObj<SolidTaskRepository>;
  let snackService: jasmine.SpyObj<SnackService>;
  let store: jasmine.SpyObj<Store>;

  const plannerState: PlannerState = {
    days: {
      ['2026-08-04']: ['task-1'],
    },
    addPlannedTasksDialogLastShown: undefined,
  };
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Planned task',
    projectId: 'project-1',
    created: 1710000000000,
  };
  const todayTag: Tag = {
    ...DEFAULT_TAG,
    id: TODAY_TAG.id,
    title: TODAY_TAG.title,
    created: 1710000000100,
    taskIds: ['task-1'],
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    solidDataLayerState = jasmine.createSpyObj<SolidDataLayerStateService>(
      'SolidDataLayerStateService',
      ['ownsPersistentAction'],
    );
    solidPlannerRepository = jasmine.createSpyObj<SolidPlannerRepository>(
      'SolidPlannerRepository',
      ['replacePlannerState'],
    );
    solidTagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'saveTag',
    ]);
    solidTaskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['saveTask'],
    );
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    store = jasmine.createSpyObj<Store>('Store', ['select']);

    solidPlannerRepository.replacePlannerState.and.resolveTo(plannerState);
    solidTagRepository.saveTag.and.callFake((savedTag) => Promise.resolve(savedTag));
    solidTaskRepository.saveTask.and.callFake((savedTask) => Promise.resolve(savedTask));
    store.select.and.callFake((selector: unknown) => {
      if (selector === selectPlannerState) return of(plannerState);
      if (selector === selectAllTasks) return of([task]);
      if (selector === selectAllTags) return of([todayTag]);
      return of([]);
    });

    TestBed.configureTestingModule({
      providers: [
        SolidPlannerPersistenceEffects,
        { provide: ALL_ACTIONS, useValue: actions$ },
        { provide: SolidDataLayerStateService, useValue: solidDataLayerState },
        { provide: SolidPlannerRepository, useValue: solidPlannerRepository },
        { provide: SolidTagRepository, useValue: solidTagRepository },
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

  it('persists planner-only actions from post-reducer state', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidPlannerPersistenceEffects);
    const subscription = effects.persistPlanner$.subscribe();

    actions$.next(
      PlannerActions.upsertPlannerDay({
        day: '2026-08-04',
        taskIds: ['task-1'],
      }),
    );
    await Promise.resolve();

    expect(solidPlannerRepository.replacePlannerState).toHaveBeenCalledOnceWith(
      plannerState,
    );
    expect(solidTaskRepository.saveTask).not.toHaveBeenCalled();
    expect(solidTagRepository.saveTag).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('persists planner, task, and tag side effects for planTaskForDay', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidPlannerPersistenceEffects);
    const subscription = effects.persistPlanner$.subscribe();

    actions$.next(
      PlannerActions.planTaskForDay({
        task,
        day: '2026-08-04',
      }),
    );
    await Promise.resolve();

    expect(solidPlannerRepository.replacePlannerState).toHaveBeenCalledOnceWith(
      plannerState,
    );
    expect(solidTaskRepository.saveTask).toHaveBeenCalledOnceWith(task);
    expect(solidTagRepository.saveTag).toHaveBeenCalledOnceWith(todayTag);
    subscription.unsubscribe();
  });

  it('ignores remote planner actions', async () => {
    solidDataLayerState.ownsPersistentAction.and.returnValue(true);
    const effects = TestBed.inject(SolidPlannerPersistenceEffects);
    const subscription = effects.persistPlanner$.subscribe();

    actions$.next({
      ...PlannerActions.moveInList({
        targetDay: '2026-08-04',
        fromIndex: 0,
        toIndex: 1,
      }),
      meta: {
        isRemote: true,
      },
    } as Action);
    await Promise.resolve();

    expect(store.select).not.toHaveBeenCalled();
    expect(solidPlannerRepository.replacePlannerState).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
