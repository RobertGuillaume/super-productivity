import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Project } from '../features/project/project.model';
import { SP_PROJECT } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import {
  SolidMutationCoordinator,
  solidMutationKey,
} from './solid-mutation-coordinator.service';
import {
  projectToSolidChanges,
  projectToSolidCreateInput,
  solidProjectQuery,
  solidThingToProject,
} from './solid-project.mapper';

type SolidProjectContainerScope = Extract<RuntimeScope, { kind: 'container' }>;

@Injectable({ providedIn: 'root' })
export class SolidProjectRepository {
  private readonly solidRuntime = inject(SolidRuntimeService);
  private readonly mutationCoordinator = inject(SolidMutationCoordinator);

  async loadProjects(): Promise<SolidRepositoryRead<Project[]>> {
    const projectContainerScope = this.projectContainerScope();

    const result = await this.solidRuntime.client.things.query(solidProjectQuery, {
      scope: projectContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(result.things.map(solidThingToProject), result.metadata);
  }

  saveProject(project: Project): Promise<Project> {
    return this.mutationCoordinator.run(solidMutationKey('project', project.id), () =>
      this.saveProjectNow(project),
    );
  }

  deleteProject(projectId: string): Promise<void> {
    return this.mutationCoordinator.run(solidMutationKey('project', projectId), () =>
      this.deleteProjectNow(projectId),
    );
  }

  private async saveProjectNow(project: Project): Promise<Project> {
    const existingThing = await this.findProjectThing(project.id);

    if (existingThing === null) {
      const created = await this.solidRuntime.client.things.create(
        projectToSolidCreateInput(project, this.solidRuntime.projectProfile),
      );
      return solidThingToProject(created);
    }

    const plan = this.solidRuntime.client.writes.planUpdate(
      existingThing.uri,
      projectToSolidChanges(project),
    );
    const commit = await this.solidRuntime.client.writes.commit(plan);

    if (commit.kind !== 'thing.update') {
      throw new Error(`Expected Solid project update commit, received ${commit.kind}`);
    }

    return solidThingToProject(commit.result);
  }

  private async deleteProjectNow(projectId: string): Promise<void> {
    const existingThing = await this.findProjectThing(projectId);
    if (existingThing !== null) {
      await this.solidRuntime.client.things.delete(existingThing.uri);
    }
  }

  subscribeProjects(listener: (projects: Project[]) => void): Unsubscribe {
    return this.solidRuntime.client.things.subscribe(
      solidProjectQuery,
      (result) => listener(result.things.map(solidThingToProject)),
      {
        emitInitial: true,
      },
    );
  }

  private async findProjectThing(projectId: string): Promise<Thing | null> {
    const result = await this.solidRuntime.client.things.query(
      {
        ...solidProjectQuery,
        where: [
          {
            kind: 'property',
            predicateUri: SP_PROJECT.id,
            value: projectId,
          },
        ],
      },
      {
        limit: 1,
        scope: this.projectContainerScope(),
        autoDiscover: false,
      },
    );

    return result.things[0] ?? null;
  }

  private projectContainerScope(): SolidProjectContainerScope {
    const layout = this.solidRuntime.ensureLayout();
    return {
      kind: 'container',
      uri: layout.containers.projects,
    };
  }
}
