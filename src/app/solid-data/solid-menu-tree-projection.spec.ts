import { DEFAULT_PROJECT, INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { MenuTreeKind, MenuTreeState } from '../features/menu-tree/store/menu-tree.model';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { normalizeSolidMenuTreeProjection } from './solid-menu-tree-projection';

describe('normalizeSolidMenuTreeProjection', () => {
  const project = (id: string, overrides: Partial<Project> = {}): Project => ({
    ...DEFAULT_PROJECT,
    id,
    title: id,
    ...overrides,
  });
  const tag = (id: string): Tag => ({
    ...DEFAULT_TAG,
    id,
    title: id,
    created: 0,
  });

  it('preserves folders and order while appending missing visible nodes', () => {
    const menuTree: MenuTreeState = {
      projectTree: [
        {
          id: 'folder-1',
          k: MenuTreeKind.FOLDER,
          name: 'Folder',
          children: [{ id: 'project-2', k: MenuTreeKind.PROJECT }],
        },
        { id: 'stale-project', k: MenuTreeKind.PROJECT },
      ],
      tagTree: [{ id: 'tag-2', k: MenuTreeKind.TAG }],
    };

    const normalized = normalizeSolidMenuTreeProjection(
      menuTree,
      [project('project-1'), project('project-2'), INBOX_PROJECT],
      [tag('tag-1'), tag('tag-2'), TODAY_TAG],
    );

    expect(normalized.projectTree).toEqual([
      menuTree.projectTree[0],
      menuTree.projectTree[1],
      { id: 'project-1', k: MenuTreeKind.PROJECT },
    ]);
    expect(normalized.tagTree).toEqual([
      { id: 'tag-2', k: MenuTreeKind.TAG },
      { id: 'tag-1', k: MenuTreeKind.TAG },
    ]);
  });

  it('excludes hidden, archived, Inbox, and Today nodes from synthesis', () => {
    const normalized = normalizeSolidMenuTreeProjection(
      { projectTree: [], tagTree: [] },
      [
        INBOX_PROJECT,
        project('hidden', { isHiddenFromMenu: true }),
        project('archived', { isArchived: true }),
      ],
      [TODAY_TAG],
    );

    expect(normalized).toEqual({ projectTree: [], tagTree: [] });
  });
});
