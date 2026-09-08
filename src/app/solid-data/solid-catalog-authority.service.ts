import { Injectable } from '@angular/core';
import type { ContainerListing, Thing } from '@solid-intents/runtime';

@Injectable({ providedIn: 'root' })
export class SolidCatalogAuthorityService {
  private readonly resourcesByContainer = new Map<string, ReadonlySet<string>>();

  recordListing(listing: ContainerListing): void {
    if (listing.status !== 'ok') {
      return;
    }

    this.resourcesByContainer.set(
      normalizeContainerUri(listing.uri),
      new Set(
        listing.entries
          .filter((entry) => entry.kind === 'resource')
          .map((entry) => documentUri(entry.uri)),
      ),
    );
  }

  isAuthoritative(containerUri: string): boolean {
    return this.resourcesByContainer.has(normalizeContainerUri(containerUri));
  }

  isResourceKnown(containerUri: string, resourceUri: string): boolean | null {
    const resources = this.resourcesByContainer.get(normalizeContainerUri(containerUri));
    return resources === undefined ? null : resources.has(documentUri(resourceUri));
  }

  filterThings(containerUri: string, things: readonly Thing[]): Thing[] {
    const normalizedContainer = normalizeContainerUri(containerUri);
    const resources = this.resourcesByContainer.get(normalizedContainer);
    if (resources === undefined) {
      return [...things];
    }

    return things.filter((thing) => {
      const sourceUri = documentUri(thing.source.uri);
      if (!isDirectChild(sourceUri, normalizedContainer)) {
        return true;
      }
      return resources.has(sourceUri);
    });
  }

  clear(): void {
    this.resourcesByContainer.clear();
  }
}

const documentUri = (uri: string): string => {
  const parsed = new URL(uri);
  parsed.hash = '';
  return parsed.toString();
};

const normalizeContainerUri = (uri: string): string =>
  uri.endsWith('/') ? uri : `${uri}/`;

const isDirectChild = (resourceUri: string, containerUri: string): boolean => {
  const resource = new URL(resourceUri);
  const container = new URL(containerUri);
  if (resource.origin !== container.origin) {
    return false;
  }

  const parentPath = resource.pathname.slice(0, resource.pathname.lastIndexOf('/') + 1);
  return parentPath === container.pathname;
};
