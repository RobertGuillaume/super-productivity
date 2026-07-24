import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import {
  createSolidAppData,
  SolidTaskHydrationService,
} from './solid-task-hydration.service';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskHydrationService', () => {
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Load me from Solid',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
  };
  const project: Project = {
    ...INBOX_PROJECT,
    id: 'project-1',
    title: 'Solid project',
    taskIds: ['task-1'],
  };
  const tag: Tag = {
    ...DEFAULT_TAG,
    id: 'tag-1',
    title: 'Solid tag',
    created: 1710000000100,
    taskIds: ['task-1'],
  };

  it('creates app data from Solid tasks, projects, and existing model defaults', () => {
    const appData = createSolidAppData({
      tasks: [task],
      projects: [project],
      tags: [tag],
    });

    expect(appData.task.ids).toEqual(['task-1']);
    expect(appData.task.entities['task-1']).toEqual(task);
    expect(appData.project.ids).toEqual([INBOX_PROJECT.id, 'project-1']);
    expect(appData.project.entities[INBOX_PROJECT.id]).toEqual(INBOX_PROJECT);
    expect(appData.project.entities['project-1']).toEqual(project);
    expect(appData.tag.ids).toEqual([TODAY_TAG.id, 'tag-1']);
    expect(appData.tag.entities[TODAY_TAG.id]).toEqual(TODAY_TAG);
    expect(appData.tag.entities['tag-1']).toEqual(tag);
    expect(appData.reminders).toEqual([]);
  });

  it('dispatches loadAllData with Solid task, project, and tag data', async () => {
    const store = jasmine.createSpyObj<Store>('Store', ['dispatch']);
    const taskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['loadTasks'],
    );
    const projectRepository = jasmine.createSpyObj<SolidProjectRepository>(
      'SolidProjectRepository',
      ['loadProjects'],
    );
    const tagRepository = jasmine.createSpyObj<SolidTagRepository>('SolidTagRepository', [
      'loadTags',
    ]);
    taskRepository.loadTasks.and.resolveTo([task]);
    projectRepository.loadProjects.and.resolveTo([project]);
    tagRepository.loadTags.and.resolveTo([tag]);

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: SolidTaskRepository, useValue: taskRepository },
        { provide: SolidProjectRepository, useValue: projectRepository },
        { provide: SolidTagRepository, useValue: tagRepository },
      ],
    });

    const service = TestBed.inject(SolidTaskHydrationService);

    await service.hydrateStore();

    const action = store.dispatch.calls.mostRecent().args[0] as unknown as ReturnType<
      typeof loadAllData
    >;
    expect(action.type).toBe(loadAllData.type);
    expect(action.appDataComplete.task.ids).toEqual(['task-1']);
    expect(action.appDataComplete.task.entities['task-1']).toEqual(task);
    expect(action.appDataComplete.project.ids).toEqual([INBOX_PROJECT.id, 'project-1']);
    expect(action.appDataComplete.project.entities['project-1']).toEqual(project);
    expect(action.appDataComplete.tag.ids).toEqual([TODAY_TAG.id, 'tag-1']);
    expect(action.appDataComplete.tag.entities['tag-1']).toEqual(tag);
  });
});
