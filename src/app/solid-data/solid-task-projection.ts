import { Project } from '../features/project/project.model';
import { Task } from '../features/tasks/task.model';

/**
 * Rebuilds the denormalized project task lists used by work-context selectors.
 * The task catalog owns membership; project lists only own order and backlog
 * placement. This projection is intentionally in-memory and must never be
 * persisted as a repair action.
 */
export const normalizeSolidTaskProjection = (
  tasks: readonly Task[],
  projects: readonly Project[],
): Project[] => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const topLevelTasksByProject = new Map<string, Task[]>();

  for (const task of tasks) {
    if (task.parentId) {
      continue;
    }
    const projectTasks = topLevelTasksByProject.get(task.projectId) ?? [];
    projectTasks.push(task);
    topLevelTasksByProject.set(task.projectId, projectTasks);
  }

  return projects.map((project) => {
    const retainedIds = new Set<string>();
    const retain = (taskId: string): boolean => {
      const task = tasksById.get(taskId);
      if (
        task === undefined ||
        task.parentId !== undefined ||
        task.projectId !== project.id ||
        retainedIds.has(taskId)
      ) {
        return false;
      }
      retainedIds.add(taskId);
      return true;
    };

    // A task already placed in the backlog must not be appended to the main list.
    const backlogTaskIds = project.backlogTaskIds.filter(retain);
    const taskIds = project.taskIds.filter(retain);

    for (const task of topLevelTasksByProject.get(project.id) ?? []) {
      if (!retainedIds.has(task.id)) {
        retainedIds.add(task.id);
        taskIds.push(task.id);
      }
    }

    return {
      ...project,
      taskIds,
      backlogTaskIds,
    };
  });
};
