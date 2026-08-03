import type { RdfLiteralValue, RdfValue, Thing, ThingView } from '@solid-intents/runtime';
import { IssueProvider } from '../features/issue/issue.model';
import { RDF_JSON_DATATYPE, SP_ISSUE_PROVIDER } from './solid-productivity-vocab';
import {
  issueProviderToSolidChanges,
  issueProviderToSolidCreateInput,
  solidThingToIssueProviderRecord,
} from './solid-issue-provider.mapper';

describe('solidIssueProvider.mapper', () => {
  const issueProvider: IssueProvider = {
    id: 'issue-provider-1',
    issueProviderKey: 'GITHUB',
    isEnabled: true,
    defaultProjectId: false,
    pinnedSearch: 'is:open assignee:@me',
    pluginId: 'github-issue-provider',
    pluginConfig: {
      repo: 'owner/repo',
      token: 'secret',
    },
  };

  it('maps an issue provider to Solid runtime create input', () => {
    const input = issueProviderToSolidCreateInput(
      issueProvider,
      {
        name: 'Issue provider',
        type: 'SuperProductivityIssueProvider',
        target: {
          containerUri: 'https://pod.example/super-productivity/issue-providers/',
        },
      },
      3,
    );

    expect(input.title).toBe('GITHUB issue provider');
    expect(input.target).toEqual({
      containerUri: 'https://pod.example/super-productivity/issue-providers/',
      resourceName: 'issue-provider-1',
    });
    expect(input.facets?.status).toBe('active');
    expect(input.properties?.[SP_ISSUE_PROVIDER.id]).toEqual(['issue-provider-1']);
    expect(input.properties?.[SP_ISSUE_PROVIDER.issueProviderKey]).toEqual(['GITHUB']);
    expect(input.properties?.[SP_ISSUE_PROVIDER.isEnabled]).toEqual([true]);
    expect(input.properties?.[SP_ISSUE_PROVIDER.order]).toEqual([3]);
    expect(input.properties?.[SP_ISSUE_PROVIDER.defaultProjectId]).toBeUndefined();
  });

  it('maps issue provider updates to replacement RDF changes', () => {
    const changes = issueProviderToSolidChanges(
      {
        ...issueProvider,
        isEnabled: false,
      },
      4,
    );

    expect(changes.properties).toBeUndefined();
    expect(changes.deleteProperties).toBeUndefined();
    expect(changes.replaceProperties?.[SP_ISSUE_PROVIDER.id]).toEqual([
      'issue-provider-1',
    ]);
    expect(changes.replaceProperties?.[SP_ISSUE_PROVIDER.isEnabled]).toEqual([false]);
    expect(changes.replaceProperties?.[SP_ISSUE_PROVIDER.order]).toEqual([4]);
  });

  it('round-trips full provider data through RDF JSON while exposing stable fields', () => {
    const thing = createThing({
      [SP_ISSUE_PROVIDER.id]: [literal(issueProvider.id)],
      [SP_ISSUE_PROVIDER.issueProviderKey]: [literal(issueProvider.issueProviderKey)],
      [SP_ISSUE_PROVIDER.isEnabled]: [literal(issueProvider.isEnabled)],
      [SP_ISSUE_PROVIDER.order]: [literal(2)],
      [SP_ISSUE_PROVIDER.providerData]: [jsonLiteral(issueProvider)],
    });

    const mapped = solidThingToIssueProviderRecord(thing);

    expect(mapped.issueProvider).toEqual(issueProvider);
    expect(mapped.order).toBe(2);
  });
});

const createThing = (
  properties: Readonly<Record<string, readonly RdfValue[]>>,
): Thing => {
  const thing: Thing = {
    uri: 'https://pod.example/super-productivity/issue-providers/issue-provider-1.ttl#it',
    content: {
      uri: 'https://pod.example/super-productivity/issue-providers/issue-provider-1.ttl',
      kind: 'rdf',
      source: 'runtime-managed',
    },
    source: {
      uri: 'https://pod.example/super-productivity/issue-providers/issue-provider-1.ttl',
      kind: 'runtime-managed',
    },
    types: ['SuperProductivityIssueProvider'],
    facets: {
      title: 'GITHUB issue provider',
      status: 'active',
    },
    properties,
    links: {},
    known: {},
    freshness: {
      source: 'pod',
      loadedAt: new Date(0),
    },
    property: (predicateUri: string) => properties[predicateUri] ?? [],
    objects: () => [],
    as: <View>(view: ThingView<View>) => view.read(thing),
  };

  return thing;
};

const literal = (value: RdfLiteralValue['value']): RdfValue => ({
  kind: 'literal',
  value,
});

const jsonLiteral = (value: unknown): RdfValue => ({
  kind: 'literal',
  value: JSON.stringify(value),
  datatype: RDF_JSON_DATATYPE,
});
