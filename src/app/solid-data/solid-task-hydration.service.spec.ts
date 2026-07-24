import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import {
  createSolidTaskAppData,
  SolidTaskHydrationService,
} from './solid-task-hydration.service';
import { SolidTaskRepository } from './solid-task.repository';

describe('SolidTaskHydrationService', () => {
  const task: Task = {
    ...DEFAULT_TASK,
    id: 'task-1',
    title: 'Load me from Solid',
    projectId: INBOX_PROJECT.id,
    created: 1710000000000,
  };

  it('creates app data from Solid tasks and existing model defaults', () => {
    const appData = createSolidTaskAppData([task]);

    expect(appData.task.ids).toEqual(['task-1']);
    expect(appData.task.entities['task-1']).toEqual(task);
    expect(appData.project.entities[INBOX_PROJECT.id]).toEqual(INBOX_PROJECT);
    expect(appData.reminders).toEqual([]);
  });

  it('dispatches loadAllData with Solid task data', async () => {
    const store = jasmine.createSpyObj<Store>('Store', ['dispatch']);
    const taskRepository = jasmine.createSpyObj<SolidTaskRepository>(
      'SolidTaskRepository',
      ['loadTasks'],
    );
    taskRepository.loadTasks.and.resolveTo([task]);

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: SolidTaskRepository, useValue: taskRepository },
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
  });
});
