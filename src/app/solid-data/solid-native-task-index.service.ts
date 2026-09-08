import { inject, Injectable } from '@angular/core';
import { getSolidDataset, getThingAll, getUrlAll } from '@inrupt/solid-client';
import { Log } from '../core/log';
import { ICAL_VTODO_CLASS } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';

const SOLID_TERMS = 'http://www.w3.org/ns/solid/terms#';
const FOR_CLASS = `${SOLID_TERMS}forClass`;
const INSTANCE = `${SOLID_TERMS}instance`;
const INSTANCE_CONTAINER = `${SOLID_TERMS}instanceContainer`;

export interface SolidNativeTaskIndexTargets {
  resourceUris: readonly string[];
  containerUris: readonly string[];
  diagnosticCount: number;
}

/** Reads only explicit VTODO type-index targets, without storage-root fallback discovery. */
@Injectable({ providedIn: 'root' })
export class SolidNativeTaskIndexService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async readTargets(): Promise<SolidNativeTaskIndexTargets> {
    const auth = this.solidRuntime.client.auth.state();
    if (auth.status !== 'authenticated') {
      return emptyTargets();
    }

    const authenticatedFetch = this.solidRuntime.client.auth.fetch();
    const indexUris = this.solidRuntime.getVerifiedTypeIndexUris();
    if (indexUris === null) {
      return { ...emptyTargets(), diagnosticCount: 1 };
    }

    const resourceUris: string[] = [];
    const containerUris: string[] = [];
    let diagnosticCount = 0;
    for (const indexUri of indexUris) {
      try {
        const typeIndex = await getSolidDataset(indexUri, {
          fetch: authenticatedFetch,
        });
        for (const registration of getThingAll(typeIndex)) {
          if (!getUrlAll(registration, FOR_CLASS).includes(ICAL_VTODO_CLASS)) {
            continue;
          }
          resourceUris.push(...getUrlAll(registration, INSTANCE));
          containerUris.push(...getUrlAll(registration, INSTANCE_CONTAINER));
        }
      } catch (error) {
        diagnosticCount++;
        Log.err('Solid native task type index lookup failed', safeIndexError(error));
      }
    }

    return {
      resourceUris: uniqueHttpUris(uniqueHttpUris(resourceUris).map(stripFragment)),
      containerUris: uniqueHttpUris(
        uniqueHttpUris(containerUris).map(normalizeContainerUri),
      ),
      diagnosticCount,
    };
  }
}

const emptyTargets = (): SolidNativeTaskIndexTargets => ({
  resourceUris: [],
  containerUris: [],
  diagnosticCount: 0,
});

const uniqueHttpUris = (uris: readonly string[]): string[] =>
  Array.from(new Set(uris.filter(isHttpUri)));

const isHttpUri = (uri: string): boolean => {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const stripFragment = (uri: string): string => {
  const parsed = new URL(uri);
  parsed.hash = '';
  return parsed.toString();
};

const normalizeContainerUri = (uri: string): string => {
  const parsed = new URL(uri);
  parsed.hash = '';
  return parsed.toString().endsWith('/') ? parsed.toString() : `${parsed.toString()}/`;
};

const safeIndexError = (error: unknown): { operation: string; errorName: string } => ({
  operation: 'read-native-task-index',
  errorName: error instanceof Error ? error.name : 'UnknownError',
});
