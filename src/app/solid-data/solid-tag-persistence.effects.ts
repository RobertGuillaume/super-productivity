import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import { catchError, concatMap, filter, take } from 'rxjs/operators';
import { SnackService } from '../core/snack/snack.service';
import { Log } from '../core/log';
import { Tag } from '../features/tag/tag.model';
import {
  addTag,
  deleteTag,
  deleteTags,
  updateAdvancedConfigForTag,
  updateTag,
} from '../features/tag/store/tag.actions';
import { selectTagById } from '../features/tag/store/tag.reducer';
import { PersistentAction } from '../op-log/core/persistent-action.interface';
import { ActionType } from '../op-log/core/operation.types';
import { T } from '../t.const';
import { ALL_ACTIONS } from '../util/local-actions.token';
import { SolidDataLayerStateService } from './solid-data-layer-state.service';
import { SolidTagRepository } from './solid-tag.repository';

type SolidTagUpdateAction =
  | ReturnType<typeof updateTag>
  | ReturnType<typeof updateAdvancedConfigForTag>;

@Injectable()
export class SolidTagPersistenceEffects {
  private readonly actions$ = inject(ALL_ACTIONS);
  private readonly store = inject(Store);
  private readonly solidDataLayerState = inject(SolidDataLayerStateService);
  private readonly solidTagRepository = inject(SolidTagRepository);
  private readonly snackService = inject(SnackService);

  persistTagCreate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is ReturnType<typeof addTag> & PersistentAction =>
            action.type === ActionType.TAG_ADD &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.solidTagRepository.saveTag(action.tag)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  persistTagUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (action): action is SolidTagUpdateAction & PersistentAction =>
            isSolidTagUpdateAction(action) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          this.store
            .select(selectTagById, { id: this.tagIdForUpdateAction(action) })
            .pipe(
              take(1),
              filter((tag): tag is Tag => !!tag),
              concatMap((tag) => from(this.solidTagRepository.saveTag(tag))),
              catchError((error) => this.handlePersistenceError(error)),
            ),
        ),
      ),
    { dispatch: false },
  );

  persistTagDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        filter(
          (
            action,
          ): action is
            | (ReturnType<typeof deleteTag> & PersistentAction)
            | (ReturnType<typeof deleteTags> & PersistentAction) =>
            (action.type === ActionType.TAG_DELETE ||
              action.type === ActionType.TAG_DELETE_MULTIPLE) &&
            !(action as PersistentAction).meta?.isRemote,
        ),
        filter((action) => this.solidDataLayerState.ownsPersistentAction(action)),
        concatMap((action) =>
          from(this.deleteTagsForAction(action)).pipe(
            catchError((error) => this.handlePersistenceError(error)),
          ),
        ),
      ),
    { dispatch: false },
  );

  private tagIdForUpdateAction(action: SolidTagUpdateAction): string {
    if (action.type === ActionType.TAG_UPDATE) {
      return action.tag.id as string;
    }

    return action.tagId;
  }

  private async deleteTagsForAction(
    action: ReturnType<typeof deleteTag> | ReturnType<typeof deleteTags>,
  ): Promise<void> {
    const tagIds = action.type === ActionType.TAG_DELETE ? [action.id] : action.ids;
    await Promise.all(tagIds.map((tagId) => this.solidTagRepository.deleteTag(tagId)));
  }

  private handlePersistenceError(error: unknown): typeof EMPTY {
    Log.err('SolidTagPersistenceEffects: failed to persist tag change', {
      name: (error as Error | undefined)?.name,
    });
    this.snackService.open({
      type: 'ERROR',
      msg: T.F.SYNC.S.PERSIST_FAILED,
      actionStr: T.PS.RELOAD,
      actionFn: (): void => {
        window.location.reload();
      },
      config: {
        duration: 0,
      },
    });
    return EMPTY;
  }
}

const SOLID_TAG_UPDATE_ACTION_TYPES = new Set<string>([
  ActionType.TAG_UPDATE,
  ActionType.TAG_UPDATE_ADVANCED_CONFIG,
]);

const isSolidTagUpdateAction = (action: unknown): action is SolidTagUpdateAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_TAG_UPDATE_ACTION_TYPES.has((action as { type: string }).type);
