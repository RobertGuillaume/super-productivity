import type {
  CreateThingInput,
  RuntimeBoundWritePlan,
  RuntimeWritePlanKind,
  RuntimeWriteRequest,
  ThingChanges,
  ThingRdfPropertyInput,
} from '@solid-intents/runtime';
import { TestBed } from '@angular/core/testing';
import { SOLID_SEMANTIC_PROFILES } from '../solid-semantic-profiles';
import { SolidMutationIntentRegistry } from '../solid-mutation-intent-registry.service';
import { SolidContainerProvisioningService } from '../solid-container-provisioning.service';

const POD_URL = 'https://pod.example/';
const WEB_ID = `${POD_URL}profile/card#me`;

export const activateSolidMutationTestBinding = (): void => {
  spyOn(TestBed.inject(SolidContainerProvisioningService), 'ensure').and.resolveTo();
  TestBed.inject(SolidMutationIntentRegistry).activateBinding({
    runtimeGeneration: 1,
    storageRoot: POD_URL,
    webId: WEB_ID,
  });
};

export const runtimeBoundWritePlan = (
  kind: RuntimeWritePlanKind,
  request: RuntimeWriteRequest,
  destination: string,
): RuntimeBoundWritePlan => {
  const creating = kind === 'thing.create';
  const thingUri =
    request.kind === 'thing.update' || request.kind === 'thing.delete'
      ? request.uri
      : `${destination}#it`;
  return {
    version: 4,
    id: `test-${kind}`,
    kind,
    identity: {
      kind: 'explicit',
      podUrl: POD_URL,
      principalWebId: WEB_ID,
      ownerWebId: WEB_ID,
      applicationNamespace: 'https://super-productivity.com/ns#',
    },
    http: [
      {
        operationIndex: 0,
        method: 'PUT',
        destination,
        mediaType: 'text/turtle',
        headers: creating
          ? Object.fromEntries([['If-None-Match', '*']])
          : Object.fromEntries([['If-Match', '"test-etag"']]),
      },
    ],
    request,
    operations: [
      creating
        ? {
            kind: 'rdf.create',
            summary: 'create test RDF source',
            resourceUri: destination,
            bodySha256: 'test-body-sha256',
          }
        : kind === 'thing.delete'
          ? {
              kind: 'rdf.subject.delete',
              summary: 'delete test RDF subject',
              thingUri,
              resourceUri: destination,
            }
          : {
              kind: 'rdf.patch',
              summary: 'update test RDF subject',
              resourceUri: destination,
              bodySha256: 'test-body-sha256',
            },
    ],
    affectedResources: [destination],
    preconditions: creating
      ? [{ kind: 'resource.missing', uri: destination }]
      : [{ kind: 'etag.matches', uri: destination, etag: '"test-etag"' }],
    diagnostics: [],
  };
};

export const createThingPlan = (
  input: CreateThingInput,
  destination: string,
): RuntimeBoundWritePlan =>
  runtimeBoundWritePlan('thing.create', { kind: 'thing.create', input }, destination);

export const updateThingPlan = (
  uri: string,
  changes: ThingChanges,
): RuntimeBoundWritePlan =>
  runtimeBoundWritePlan(
    'thing.update',
    { kind: 'thing.update', uri, changes },
    uri.split('#')[0],
  );

export const deleteThingPlan = (uri: string): RuntimeBoundWritePlan =>
  runtimeBoundWritePlan(
    'thing.delete',
    {
      kind: 'thing.delete',
      uri,
      thingUri: uri,
      resources: [{ uri: uri.split('#')[0], role: 'rdf-source' }],
      registrations: [],
      allowUnversioned: false,
    },
    uri.split('#')[0],
  );

interface RuntimeWriteSpies {
  planCreate?: jasmine.Spy;
  planDelete?: jasmine.Spy;
  commit: jasmine.Spy;
}

interface LegacyThingSpies {
  create?: jasmine.Spy;
  delete?: jasmine.Spy;
}

/** Lets mapper-focused repository specs model the runtime commit boundary. */
export const installRuntimeWritePlanBridge = (
  writes: RuntimeWriteSpies,
  things: LegacyThingSpies,
): void => {
  writes.planCreate = jasmine
    .createSpy('planCreate')
    .and.callFake(async (input) => createThingPlan(input, plannedDestination(input)));
  writes.planDelete = jasmine
    .createSpy('planDelete')
    .and.callFake(async (uri) => deleteThingPlan(uri));
  writes.commit.and.callFake(async (plan: RuntimeBoundWritePlan) => {
    if (plan.request.kind === 'thing.create') {
      const result = await things.create?.(legacyCreateInput(plan.request.input));
      return { planId: plan.id, kind: 'thing.create', result };
    }
    if (plan.request.kind === 'thing.delete') {
      await things.delete?.(plan.request.uri);
      return { planId: plan.id, kind: 'thing.delete', outcomes: [] };
    }
    throw new Error(`Test write bridge has no result for ${plan.kind}`);
  });
};

const legacyCreateInput = (input: CreateThingInput): CreateThingInput => {
  const type = typeof input.profile === 'string' ? input.profile : input.profile?.type;
  const profile = SOLID_SEMANTIC_PROFILES.find((candidate) => candidate.type === type);
  const properties: Record<string, ThingRdfPropertyInput[string]> = {
    ...input.properties,
  };
  for (const [name, value] of Object.entries(input.fields ?? {})) {
    const definition = profile?.fields?.[name];
    if (definition === undefined || value === null) continue;
    properties[definition.predicateUri] = Array.isArray(value) ? value : [value];
  }
  return { ...input, fields: undefined, properties };
};

const plannedDestination = (input: CreateThingInput): string => {
  const target =
    input.target ??
    (typeof input.profile === 'object' ? input.profile.target : undefined);
  if (target?.containerUri === undefined) {
    throw new Error('Test create plan requires a container target');
  }
  const resourceName = input.target?.resourceName ?? 'resource';
  return new URL(`${resourceName}.ttl`, target.containerUri).toString();
};
