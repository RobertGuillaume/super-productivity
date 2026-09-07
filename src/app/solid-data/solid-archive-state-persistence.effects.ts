import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { ArchiveDbAdapter } from '../core/persistence/archive-db-adapter.service';
import { ArchiveModel } from '../features/archive/archive.model';
import { selectTimeTrackingState } from '../features/time-tracking/store/time-tracking.selectors';
import { TimeTrackingState } from '../features/time-tracking/time-tracking.model';
import { initialTimeTrackingState } from '../features/time-tracking/store/time-tracking.reducer';
import { Task, TaskArchive } from '../features/tasks/task.model';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { LOCAL_ACTIONS } from '../util/local-actions.token';
import { SolidArchiveStateRepository } from './solid-archive-state.repository';
import {
  isSolidArchiveStatePersistenceTrigger,
  SolidArchiveStateAction,
  SolidArchiveStatePersistenceTrigger,
  solidArchiveStateSourceAction,
} from './solid-archive-state-action-types';
import { SolidArchivedTask, SolidArchiveBucket } from './solid-archived-task.mapper';
import { SolidArchivedTaskRepository } from './solid-archived-task.repository';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { handleSolidPersistenceError } from './solid-persistence-error-handler';
import { settleSolidMutations } from './solid-mutation-coordinator.service';
import { SolidTimeTrackingRepository } from './solid-time-tracking.repository';
import { SnackService } from '../core/snack/snack.service';

@Injectable()
export class SolidArchiveStatePersistenceEffects {
  private readonly actions$ = inject(LOCAL_ACTIONS);
  private readonly archiveDbAdapter = inject(ArchiveDbAdapter);
  private readonly solidArchiveStateRepository = inject(SolidArchiveStateRepository);
  private readonly solidArchivedTaskRepository = inject(SolidArchivedTaskRepository);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTimeTrackingRepository = inject(SolidTimeTrackingRepository);
  private readonly snackService = inject(SnackService);
  private readonly store = inject(Store);

  persistArchiveState$ = createEffect(
    () =>
      this.actions$.pipe(
        filter((action): action is SolidArchiveStatePersistenceTrigger =>
          isSolidArchiveStatePersistenceTrigger(action),
        ),
        filter((action) => {
          const sourceAction = solidArchiveStateSourceAction(action);
          return (
            !(sourceAction as PersistentAction).meta?.isRemote &&
            this.solidDataLayerState.ownsPersistentAction(
              sourceAction as SolidArchiveStateAction & PersistentAction,
            )
          );
        }),
        concatMap(() =>
          this.store.select(selectTimeTrackingState).pipe(
            take(1),
            concatMap((timeTrackingState) =>
              from(this.persistArchiveMirror(timeTrackingState)),
            ),
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private async persistArchiveMirror(
    activeTimeTrackingState: TimeTrackingState,
  ): Promise<void> {
    const [archiveYoung, archiveOld] = await Promise.all([
      this.archiveDbAdapter.loadArchiveYoung(),
      this.archiveDbAdapter.loadArchiveOld(),
    ]);
    const young = archiveYoung ?? createEmptyArchiveModel();
    const old = archiveOld ?? createEmptyArchiveModel();
    const archivedTasks = [
      ...archivedTasksFromArchiveModel(young, 'young'),
      ...archivedTasksFromArchiveModel(old, 'old'),
    ];

    await settleSolidMutations([
      this.solidArchiveStateRepository.saveArchiveState(
        this.solidArchiveStateRepository.archiveModelToSolidArchiveState('young', young),
      ),
      this.solidArchiveStateRepository.saveArchiveState(
        this.solidArchiveStateRepository.archiveModelToSolidArchiveState('old', old),
      ),
      this.solidArchivedTaskRepository.replaceArchivedTasks(archivedTasks),
      this.solidTimeTrackingRepository.replaceTimeTrackingState(activeTimeTrackingState),
    ]);
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    return handleSolidPersistenceError({
      error,
      snackService: this.snackService,
      sessionRecovery: this.solidDataLayerState,
      source: 'SolidArchiveStatePersistenceEffects: failed to persist archive state',
    });
  }
}

const createEmptyArchiveModel = (): ArchiveModel => ({
  task: {
    ids: [],
    entities: {},
  },
  timeTracking: initialTimeTrackingState,
  lastTimeTrackingFlush: 0,
});

const archivedTasksFromArchiveModel = (
  archiveModel: ArchiveModel,
  bucket: SolidArchiveBucket,
): SolidArchivedTask[] =>
  taskArchiveToTasks(archiveModel.task).map((task) => ({
    task,
    bucket,
  }));

const taskArchiveToTasks = (taskArchive: TaskArchive): Task[] =>
  (taskArchive.ids as string[])
    .map((id) => taskArchive.entities[id])
    .filter((task): task is Task => task !== undefined && task !== null);
