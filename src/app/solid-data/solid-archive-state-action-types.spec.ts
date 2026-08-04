import {
  archiveOperationHandled,
  compressArchive,
} from '../features/archive/store/archive.actions';
import { deleteTag, deleteTags } from '../features/tag/store/tag.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import {
  isSolidArchiveStatePersistenceTrigger,
  SOLID_ARCHIVE_STATE_MAINTENANCE_SOURCE_ACTION_TYPES,
} from './solid-archive-state-action-types';

describe('solid archive state action types', () => {
  it('classifies every post-handler archive maintenance source action', () => {
    const sourceActions = [
      compressArchive({
        timestamp: 1710000000000,
        oneYearAgoTimestamp: 1678464000000,
      }),
      TaskSharedActions.deleteProject({
        projectId: 'project-1',
        noteIds: ['note-1'],
        allTaskIds: ['task-1'],
      }),
      deleteTag({ id: 'tag-1' }),
      deleteTags({ ids: ['tag-1', 'tag-2'] }),
      TaskSharedActions.deleteTaskRepeatCfg({
        taskRepeatCfgId: 'repeat-cfg-1',
      }),
      TaskSharedActions.deleteIssueProvider({
        issueProviderId: 'issue-provider-1',
        taskIdsToUnlink: ['task-1'],
      }),
      TaskSharedActions.deleteIssueProviders({
        ids: ['issue-provider-1', 'issue-provider-2'],
        taskIdsToUnlink: ['task-1'],
      }),
    ];

    sourceActions.forEach((sourceAction) => {
      expect(SOLID_ARCHIVE_STATE_MAINTENANCE_SOURCE_ACTION_TYPES.has(sourceAction.type))
        .withContext(sourceAction.type)
        .toBe(true);
      expect(
        isSolidArchiveStatePersistenceTrigger(archiveOperationHandled({ sourceAction })),
      )
        .withContext(sourceAction.type)
        .toBe(true);
    });
  });
});
