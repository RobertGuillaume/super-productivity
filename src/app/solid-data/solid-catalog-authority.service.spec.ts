import { TestBed } from '@angular/core/testing';
import type { ContainerListing, Thing } from '@solid-intents/runtime';
import { SolidCatalogAuthorityService } from './solid-catalog-authority.service';

describe('SolidCatalogAuthorityService', () => {
  const containerUri = 'https://pod.example/super-productivity/tasks/';
  const presentResource = `${containerUri}present.ttl`;
  const staleResource = `${containerUri}stale.ttl`;

  it('filters direct app-container Things through a successful listing', () => {
    const service = TestBed.inject(SolidCatalogAuthorityService);
    service.recordListing(listing('ok', [presentResource]));

    expect(
      service
        .filterThings(containerUri, [
          thing(`${presentResource}#it`),
          thing(`${staleResource}#it`),
          thing('https://calendar.example/events/native.ics#todo'),
        ])
        .map(({ uri }) => uri),
    ).toEqual([
      `${presentResource}#it`,
      'https://calendar.example/events/native.ics#todo',
    ]);
  });

  it('retains the previous authority after failed and not-modified listings', () => {
    const service = TestBed.inject(SolidCatalogAuthorityService);
    service.recordListing(listing('ok', [presentResource]));

    service.recordListing(listing('failed', []));
    service.recordListing(listing('not-modified', []));

    expect(service.isResourceKnown(containerUri, presentResource)).toBe(true);
    expect(service.isResourceKnown(containerUri, staleResource)).toBe(false);
  });

  it('treats a successful empty listing as authoritative', () => {
    const service = TestBed.inject(SolidCatalogAuthorityService);

    service.recordListing(listing('ok', []));

    expect(service.isAuthoritative(containerUri)).toBe(true);
    expect(service.filterThings(containerUri, [thing(`${staleResource}#it`)])).toEqual(
      [],
    );
  });

  const listing = (
    status: ContainerListing['status'],
    resourceUris: readonly string[],
  ): ContainerListing => ({
    uri: containerUri,
    status,
    entries: resourceUris.map((uri) => ({ uri, kind: 'resource' })),
    readAt: new Date(0),
    httpStatus: status === 'ok' ? 200 : 500,
    contentType: 'text/turtle',
  });

  const thing = (uri: string): Thing =>
    ({
      uri,
      source: { uri, kind: 'rdf', containerUri },
    }) as Thing;
});
