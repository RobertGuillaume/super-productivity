import { DEFAULT_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { normalizeSolidTaskProjection } from './solid-task-projection';

describe('normalizeSolidTaskProjection', () => {
  const task = (id: string, projectId: string, parentId?: string): Task => ({
    ...DEFAULT_TASK,
    id,
    title: id,
    projectId,
    parentId,
  });
  const project = (overrides: Partial<Project> = {}): Project => ({
    ...DEFAULT_PROJECT,
    id: 'project-1',
    title: 'Project',
    taskIds: [],
    backlogTaskIds: [],
    ...overrides,
  });

  it('preserves placement and appends missing top-level tasks in catalog order', () => {
    const tasks = [
      task('new-1', 'project-1'),
      task('main', 'project-1'),
      task('new-2', 'project-1'),
      task('backlog', 'project-1'),
    ];

    const [normalized] = normalizeSolidTaskProjection(tasks, [
      project({
        taskIds: ['main'],
        backlogTaskIds: ['backlog'],
      }),
    ]);

    expect(normalized.taskIds).toEqual(['main', 'new-1', 'new-2']);
    expect(normalized.backlogTaskIds).toEqual(['backlog']);
  });

  it('removes duplicates, missing tasks, subtasks, and wrong-project references', () => {
    const tasks = [
      task('main', 'project-1'),
      task('subtask', 'project-1', 'main'),
      task('other', 'project-2'),
    ];

    const [normalized] = normalizeSolidTaskProjection(tasks, [
      project({
        taskIds: ['main', 'main', 'subtask', 'other', 'deleted'],
        backlogTaskIds: ['main'],
      }),
    ]);

    expect(normalized.taskIds).toEqual([]);
    expect(normalized.backlogTaskIds).toEqual(['main']);
  });

  it('does not mutate repository results or place tasks for unloaded projects', () => {
    const originalProject = project({ taskIds: ['deleted'] });
    const originalTaskIds = originalProject.taskIds;
    const tasks = [task('not-yet-placeable', 'project-not-loaded')];

    const normalized = normalizeSolidTaskProjection(tasks, [originalProject]);

    expect(normalized[0].taskIds).toEqual([]);
    expect(originalProject.taskIds).toBe(originalTaskIds);
    expect(originalProject.taskIds).toEqual(['deleted']);
  });
});
