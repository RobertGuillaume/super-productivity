import { IssueProviderActions } from '../features/issue/store/issue-provider.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';

export type SolidIssueProviderSaveAction =
  | ReturnType<typeof IssueProviderActions.addIssueProvider>
  | ReturnType<typeof IssueProviderActions.updateIssueProvider>
  | ReturnType<typeof IssueProviderActions.sortIssueProvidersFirst>;

export type SolidIssueProviderDeleteAction =
  | ReturnType<typeof TaskSharedActions.deleteIssueProvider>
  | ReturnType<typeof TaskSharedActions.deleteIssueProviders>;

export type SolidIssueProviderAction =
  | SolidIssueProviderSaveAction
  | SolidIssueProviderDeleteAction;

export const SOLID_ISSUE_PROVIDER_SAVE_ACTION_TYPES = new Set<string>([
  IssueProviderActions.addIssueProvider.type,
  IssueProviderActions.updateIssueProvider.type,
  IssueProviderActions.sortIssueProvidersFirst.type,
]);

export const SOLID_ISSUE_PROVIDER_DELETE_ACTION_TYPES = new Set<string>([
  TaskSharedActions.deleteIssueProvider.type,
  TaskSharedActions.deleteIssueProviders.type,
]);

export const SOLID_ISSUE_PROVIDER_ACTION_TYPES = new Set<string>([
  ...SOLID_ISSUE_PROVIDER_SAVE_ACTION_TYPES,
  ...SOLID_ISSUE_PROVIDER_DELETE_ACTION_TYPES,
]);

export const isSolidIssueProviderSaveAction = (
  action: unknown,
): action is SolidIssueProviderSaveAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_ISSUE_PROVIDER_SAVE_ACTION_TYPES.has((action as { type: string }).type);

export const isSolidIssueProviderDeleteAction = (
  action: unknown,
): action is SolidIssueProviderDeleteAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  SOLID_ISSUE_PROVIDER_DELETE_ACTION_TYPES.has((action as { type: string }).type);
