import { inject, Injectable } from '@angular/core';
import type { RuntimeScope, Thing, Unsubscribe } from '@solid-intents/runtime';
import { Project } from '../features/project/project.model';
import { SP_PROJECT } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';
import { SolidRepositoryRead, solidRepositoryRead } from './solid-repository-read';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';
import {
  SolidRepositoryMutation,
  SolidRepositoryOperations,
} from './solid-repository-operations.service';
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
  private readonly catalogAuthority = inject(SolidCatalogAuthorityService);
  private readonly operations = inject(SolidRepositoryOperations);

  async loadProjects(): Promise<SolidRepositoryRead<Project[]>> {
    const projectContainerScope = this.projectContainerScope();

    const result = await this.solidRuntime.client.things.query(solidProjectQuery, {
      scope: projectContainerScope,
      autoDiscover: false,
    });

    return solidRepositoryRead(
      this.catalogAuthority
        .filterThings(projectContainerScope.uri, result.things)
        .map((thing) =>
          this.operations.remember(
            'project',
            solidThingToProject(thing).id,
            thing,
            solidThingToProject(thing),
          ),
        ),
      result.metadata,
    );
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
    return this.operations.upsert(this.projectMutation(project));
  }

  private async deleteProjectNow(projectId: string): Promise<void> {
    await this.operations.delete(
      'project',
      projectId,
      this.solidRuntime.projectProfile,
      projectId,
    );
  }

  private projectMutation(project: Project): SolidRepositoryMutation<Project> {
    return {
      model: 'project',
      id: project.id,
      value: project,
      resourceName: project.id,
      profile: this.solidRuntime.projectProfile,
      createInput: projectToSolidCreateInput(project, this.solidRuntime.projectProfile),
      changes: projectToSolidChanges(project),
      map: solidThingToProject,
    };
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
