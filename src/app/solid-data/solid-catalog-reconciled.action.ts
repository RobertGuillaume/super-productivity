import { createAction, props } from '@ngrx/store';
import { AppDataComplete } from '../op-log/model/model-config';

/**
 * Replaces the Solid-backed projection after initial app hydration.
 *
 * A dedicated action keeps regular `loadAllData` effects from running again while the
 * meta-reducer still applies the same full-state reducer semantics atomically.
 */
export const solidCatalogReconciled = createAction(
  '[Solid] Catalog reconciled',
  props<{ appDataComplete: AppDataComplete }>(),
);
