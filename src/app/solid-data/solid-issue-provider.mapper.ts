import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { IssueProvider } from '../features/issue/issue.model';
import {
  SOLID_PRODUCTIVITY_ISSUE_PROVIDERS_CONTAINER,
  SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
  SP_ISSUE_PROVIDER,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  addOptionalLiteral,
  booleanProp,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export interface SolidIssueProviderRecord {
  issueProvider: IssueProvider;
  order: number;
}

export const issueProviderToSolidCreateInput = (
  issueProvider: IssueProvider,
  profile: ThingWriteProfile,
  order = 0,
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_ISSUE_PROVIDERS_CONTAINER,
    resourceName: issueProvider.id,
  },
  title: issueProviderTitle(issueProvider),
  facets: {
    title: issueProviderTitle(issueProvider),
    status: issueProvider.isEnabled ? 'active' : 'disabled',
  },
  properties: issueProviderToSolidProperties(issueProvider, order),
});

export const issueProviderToSolidChanges = (
  issueProvider: IssueProvider,
  order = 0,
): ThingChanges => ({
  title: issueProviderTitle(issueProvider),
  status: issueProvider.isEnabled ? 'active' : 'disabled',
  replaceProperties: buildIssueProviderSolidProperties(issueProvider, order),
});

export const issueProviderToSolidProperties = (
  issueProvider: IssueProvider,
  order = 0,
): ThingRdfPropertyInput => buildIssueProviderSolidProperties(issueProvider, order);

export const solidThingToIssueProviderRecord = (
  thing: Thing,
): SolidIssueProviderRecord => {
  const issueProvider =
    jsonProp<IssueProvider>(thing, SP_ISSUE_PROVIDER.providerData) ??
    ({
      id: stringProp(thing, SP_ISSUE_PROVIDER.id) ?? thing.uri,
      issueProviderKey: stringProp(thing, SP_ISSUE_PROVIDER.issueProviderKey) as
        | IssueProvider['issueProviderKey']
        | undefined,
      isEnabled:
        booleanProp(thing, SP_ISSUE_PROVIDER.isEnabled) ??
        thing.facets.status !== 'disabled',
      defaultProjectId: stringOrNullProp(thing, SP_ISSUE_PROVIDER.defaultProjectId),
      pinnedSearch: stringOrNullProp(thing, SP_ISSUE_PROVIDER.pinnedSearch),
    } as IssueProvider);

  const mappedIssueProvider = {
    ...issueProvider,
    id: stringProp(thing, SP_ISSUE_PROVIDER.id) ?? issueProvider.id,
    isEnabled: booleanProp(thing, SP_ISSUE_PROVIDER.isEnabled) ?? issueProvider.isEnabled,
    issueProviderKey:
      (stringProp(thing, SP_ISSUE_PROVIDER.issueProviderKey) as
        | IssueProvider['issueProviderKey']
        | undefined) ?? issueProvider.issueProviderKey,
  } as IssueProvider;

  return {
    issueProvider: mappedIssueProvider,
    order: numberProp(thing, SP_ISSUE_PROVIDER.order) ?? 0,
  };
};

export const solidThingToIssueProvider = (thing: Thing): IssueProvider =>
  solidThingToIssueProviderRecord(thing).issueProvider;

export const solidIssueProviderQuery = {
  type: SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
} as const;

const buildIssueProviderSolidProperties = (
  issueProvider: IssueProvider,
  order: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_ISSUE_PROVIDER.id, issueProvider.id);
  addLiteral(
    properties,
    SP_ISSUE_PROVIDER.issueProviderKey,
    issueProvider.issueProviderKey,
  );
  addLiteral(properties, SP_ISSUE_PROVIDER.isEnabled, issueProvider.isEnabled);
  addLiteral(properties, SP_ISSUE_PROVIDER.order, order);
  addJson(properties, SP_ISSUE_PROVIDER.providerData, issueProvider);

  addOptionalLiteral(
    properties,
    SP_ISSUE_PROVIDER.defaultProjectId,
    issueProvider.defaultProjectId === false ? undefined : issueProvider.defaultProjectId,
  );
  addOptionalLiteral(
    properties,
    SP_ISSUE_PROVIDER.pinnedSearch,
    issueProvider.pinnedSearch,
  );

  return properties;
};

const issueProviderTitle = (issueProvider: IssueProvider): string =>
  `${issueProvider.issueProviderKey} issue provider`;
