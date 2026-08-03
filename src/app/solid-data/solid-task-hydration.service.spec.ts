import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { Note } from '../features/note/note.model';
import { IssueProvider } from '../features/issue/issue.model';
import { DEFAULT_TASK, Task } from '../features/tasks/task.model';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../features/task-repeat-cfg/task-repeat-cfg.model';
import { INBOX_PROJECT } from '../features/project/project.const';
import { Project } from '../features/project/project.model';
import { Section } from '../features/section/section.model';
import { DEFAULT_TAG, TODAY_TAG } from '../features/tag/tag.const';
import { Tag } from '../features/tag/tag.model';
import { WorkContextType } from '../features/work-context/work-context.model';
import { loadAllData } from '../root-store/meta/load-all-data.action';
import { SOLID_APP_STATE_ID, SolidAppState } from './solid-app-state.mapper';
import { SolidAppStateRepository } from './solid-app-state.repository';
import {
  createSolidAppData,
  SolidTaskHydrationService,
} from './solid-task-hydration.service';
import { SolidNoteRepository } from './solid-note.repository';
import { SolidIssueProviderRepository } from './solid-issue-provider.repository';
import { SolidProjectRepository } from './solid-project.repository';
import { SolidSectionRepository } from './solid-section.repository';
import { SolidTagRepository } from './solid-tag.repository';
import { SolidTaskRepository } from './solid-task.repository';
import { SolidTaskRepeatCfgRepository } from './solid-task-repeat-cfg.repository';

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
  const note: Note = {
    id: 'note-1',
    projectId: 'project-1',
    isPinnedToToday: true,
    content: 'Solid note',
    created: 1710000000200,
    modified: 1710000000300,
  };
  const section: Section = {
    id: 'section-1',
    contextId: 'project-1',
    contextType: WorkContextType.PROJECT,
    title: 'Solid section',
    isExpanded: true,
    taskIds: ['task-1'],
  };
  const issueProvider: IssueProvider = {
    id: 'issue-provider-1',
    issueProviderKey: 'GITHUB',
    isEnabled: true,
    pluginId: 'github-issue-provider',
    pluginConfig: {
      repo: 'owner/repo',
    },
  };
  const taskRepeatCfg: TaskRepeatCfg = {
    ...DEFAULT_TASK_REPEAT_CFG,
    id: 'repeat-cfg-1',
    projectId: 'project-1',
    title: 'Repeat from Solid',
    tagIds: ['tag-1'],
  };
  const appState: SolidAppState = {
    id: SOLID_APP_STATE_ID,
    projectOrder: ['project-2', 'project-1'],
    tagOrder: ['tag-2', TODAY_TAG.id, 'tag-1'],
    noteTodayOrder: ['note-2', 'note-1'],
    sectionOrder: ['section-2', 'section-1'],
    updated: 1710000000400,
  };

  it('creates app data from Solid tasks, projects, and existing model defaults', () => {
    const appData = createSolidAppData({
      tasks: [task],
      projects: [project],
      tags: [tag],
      notes: [note],
      sections: [section],
      issueProviders: [issueProvider],
      taskRepeatCfgs: [taskRepeatCfg],
    });

    expect(appData.task.ids).toEqual(['task-1']);
    expect(appData.task.entities['task-1']).toEqual(task);
    expect(appData.project.ids).toEqual([INBOX_PROJECT.id, 'project-1']);
    expect(appData.project.entities[INBOX_PROJECT.id]).toEqual(INBOX_PROJECT);
    expect(appData.project.entities['project-1']).toEqual(project);
    expect(appData.tag.ids).toEqual([TODAY_TAG.id, 'tag-1']);
    expect(appData.tag.entities[TODAY_TAG.id]).toEqual(TODAY_TAG);
    expect(appData.tag.entities['tag-1']).toEqual(tag);
    expect(appData.note.ids).toEqual(['note-1']);
    expect(appData.note.entities['note-1']).toEqual(note);
    expect(appData.note.todayOrder).toEqual(['note-1']);
    expect(appData.section.ids).toEqual(['section-1']);
    expect(appData.section.entities['section-1']).toEqual(section);
    expect(appData.issueProvider.ids).toEqual(['issue-provider-1']);
    expect(appData.issueProvider.entities['issue-provider-1']).toEqual(issueProvider);
    expect(appData.taskRepeatCfg.ids).toEqual(['repeat-cfg-1']);
    expect(appData.taskRepeatCfg.entities['repeat-cfg-1']).toEqual(taskRepeatCfg);
    expect(appData.reminders).toEqual([]);
  });

  it('applies Solid app-state ordering while preserving missing entities', () => {
    const project2: Project = {
      ...project,
      id: 'project-2',
    };
    const project3: Project = {
      ...project,
      id: 'project-3',
    };
    const tag2: Tag = {
      ...tag,
      id: 'tag-2',
    };
    const note2: Note = {
      ...note,
      id: 'note-2',
    };
    const note3: Note = {
      ...note,
      id: 'note-3',
    };
    const section2: Section = {
      ...section,
      id: 'section-2',
    };
    const section3: Section = {
      ...section,
      id: 'section-3',
    };

    const appData = createSolidAppData({
      tasks: [task],
      projects: [project, project3, project2],
      tags: [tag, tag2],
      notes: [note, note3, note2],
      sections: [section, section3, section2],
      appState,
    });

    expect(appData.project.ids).toEqual([
      INBOX_PROJECT.id,
      'project-2',
      'project-1',
      'project-3',
    ]);
    expect(appData.tag.ids).toEqual(['tag-2', TODAY_TAG.id, 'tag-1']);
    expect(appData.note.todayOrder).toEqual(['note-2', 'note-1', 'note-3']);
    expect(appData.section.ids).toEqual(['section-2', 'section-1', 'section-3']);
  });

  it('dispatches loadAllData with Solid task, project, tag, note, section, and issue provider data', async () => {
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
    const noteRepository = jasmine.createSpyObj<SolidNoteRepository>(
      'SolidNoteRepository',
      ['loadNotes'],
    );
    const sectionRepository = jasmine.createSpyObj<SolidSectionRepository>(
      'SolidSectionRepository',
      ['loadSections'],
    );
    const issueProviderRepository = jasmine.createSpyObj<SolidIssueProviderRepository>(
      'SolidIssueProviderRepository',
      ['loadIssueProviders'],
    );
    const taskRepeatCfgRepository = jasmine.createSpyObj<SolidTaskRepeatCfgRepository>(
      'SolidTaskRepeatCfgRepository',
      ['loadTaskRepeatCfgs'],
    );
    const appStateRepository = jasmine.createSpyObj<SolidAppStateRepository>(
      'SolidAppStateRepository',
      ['loadAppState'],
    );
    taskRepository.loadTasks.and.resolveTo([task]);
    projectRepository.loadProjects.and.resolveTo([project]);
    tagRepository.loadTags.and.resolveTo([tag]);
    noteRepository.loadNotes.and.resolveTo([note]);
    sectionRepository.loadSections.and.resolveTo([section]);
    issueProviderRepository.loadIssueProviders.and.resolveTo([issueProvider]);
    taskRepeatCfgRepository.loadTaskRepeatCfgs.and.resolveTo([taskRepeatCfg]);
    appStateRepository.loadAppState.and.resolveTo(appState);

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: SolidTaskRepository, useValue: taskRepository },
        { provide: SolidProjectRepository, useValue: projectRepository },
        { provide: SolidTagRepository, useValue: tagRepository },
        { provide: SolidNoteRepository, useValue: noteRepository },
        { provide: SolidSectionRepository, useValue: sectionRepository },
        { provide: SolidIssueProviderRepository, useValue: issueProviderRepository },
        { provide: SolidTaskRepeatCfgRepository, useValue: taskRepeatCfgRepository },
        { provide: SolidAppStateRepository, useValue: appStateRepository },
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
    expect(action.appDataComplete.note.ids).toEqual(['note-1']);
    expect(action.appDataComplete.note.entities['note-1']).toEqual(note);
    expect(action.appDataComplete.note.todayOrder).toEqual(['note-1']);
    expect(action.appDataComplete.section.ids).toEqual(['section-1']);
    expect(action.appDataComplete.section.entities['section-1']).toEqual(section);
    expect(action.appDataComplete.issueProvider.ids).toEqual(['issue-provider-1']);
    expect(action.appDataComplete.issueProvider.entities['issue-provider-1']).toEqual(
      issueProvider,
    );
    expect(action.appDataComplete.taskRepeatCfg.ids).toEqual(['repeat-cfg-1']);
    expect(action.appDataComplete.taskRepeatCfg.entities['repeat-cfg-1']).toEqual(
      taskRepeatCfg,
    );
    expect(sectionRepository.loadSections).toHaveBeenCalledTimes(1);
    expect(issueProviderRepository.loadIssueProviders).toHaveBeenCalledTimes(1);
    expect(taskRepeatCfgRepository.loadTaskRepeatCfgs).toHaveBeenCalledTimes(1);
    expect(appStateRepository.loadAppState).toHaveBeenCalledTimes(1);
  });
});
