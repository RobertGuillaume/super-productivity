import { inject, Injectable } from '@angular/core';
import type { ContainerListing, DiscoveryStatus } from '@solid-intents/runtime';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';

const MAX_DISCOVERY_DRAIN_RUNS = 100;
const DISCOVERY_RETRY_DELAY_MS = 1000;

/**
 * Builds one complete runtime catalog snapshot before hydration repositories query it.
 *
 * Runtime discovery is deliberately bounded per run. Hydration cannot use one bounded
 * run as a completion signal because doing so would replace the store with a partial
 * snapshot. Explicitly listing app containers also avoids the runtime's per-container
 * discovery limit hiding entries after the first page-sized batch.
 */
@Injectable({ providedIn: 'root' })
export class SolidHydrationDiscoveryService {
  private readonly solidRuntime = inject(SolidRuntimeService);

  async prepare(): Promise<void> {
    const runtime = this.solidRuntime.client;
    const containerUris = Object.values(this.solidRuntime.ensureLayout().containers);
    const listings = await Promise.all(
      containerUris.map((containerUri) => runtime.storage.listContainer(containerUri)),
    );

    assertReadableAppContainers(listings);

    const entryUris = listings.flatMap((listing) =>
      listing.status === 'ok' ? listing.entries.map((entry) => entry.uri) : [],
    );
    await runtime.discovery.refresh({
      uris: Array.from(new Set([...containerUris, ...entryUris])),
    });
    await this.drainDiscoveryQueue();
    await this.assertAppResourcesIndexed(listings);

    // App-owned data lives in the containers above. Compatible native tasks may live
    // elsewhere and are discovered through the Solid type index (with runtime fallback).
    await runtime.discovery.discoverType(SOLID_PRODUCTIVITY_TASK_TYPE);
    await this.drainDiscoveryQueue();
  }

  private async assertAppResourcesIndexed(
    listings: readonly ContainerListing[],
  ): Promise<void> {
    const runtime = this.solidRuntime.client;
    let expectedResourceCount = 0;
    let missingResourceCount = 0;

    for (const listing of listings) {
      if (listing.status !== 'ok') {
        continue;
      }

      const resourceUris = listing.entries
        .filter((entry) => entry.kind === 'resource')
        .map((entry) => entry.uri);
      expectedResourceCount += resourceUris.length;
      const result = await runtime.things.query(
        {},
        {
          scope: { kind: 'container', uri: listing.uri },
          autoDiscover: false,
        },
      );
      const indexedSourceUris = new Set(
        result.things.flatMap((thing) => [thing.source.uri, thing.content.uri]),
      );
      missingResourceCount += resourceUris.filter(
        (resourceUri) => !indexedSourceUris.has(resourceUri),
      ).length;
    }

    if (missingResourceCount > 0) {
      throw new Error(
        `Solid hydration did not index ${missingResourceCount} of ` +
          `${expectedResourceCount} application resource(s)`,
      );
    }
  }

  private async drainDiscoveryQueue(): Promise<void> {
    const discovery = this.solidRuntime.client.discovery;

    for (let run = 0; run < MAX_DISCOVERY_DRAIN_RUNS; run++) {
      const before = discovery.status();
      assertDiscoveryCanRun(before);
      if (isDiscoverySettled(before)) {
        return;
      }

      await discovery.start();
      const after = discovery.status();
      assertDiscoveryCanRun(after);
      if (isDiscoverySettled(after)) {
        return;
      }

      // Failed runtime jobs remain queued until their retry backoff expires. Avoid
      // exhausting the bounded drain loop while no job is eligible to run yet.
      if (after.completedJobs === before.completedJobs) {
        await delay(DISCOVERY_RETRY_DELAY_MS);
      }
    }

    const status = discovery.status();
    throw new Error(
      `Solid hydration discovery did not settle (${status.queuedJobs} queued, ` +
        `${status.inFlightJobs} in flight)`,
    );
  }
}

const assertReadableAppContainers = (listings: readonly ContainerListing[]): void => {
  const unreadable = listings.filter(
    (listing) => listing.status === 'failed' || listing.status === 'inaccessible',
  );
  if (unreadable.length === 0) {
    return;
  }

  const httpStatuses = Array.from(
    new Set(unreadable.map((listing) => listing.httpStatus)),
  ).join(', ');
  throw new Error(
    `Solid hydration could not read ${unreadable.length} application container(s)` +
      (httpStatuses === '' ? '' : ` (HTTP ${httpStatuses})`),
  );
};

const assertDiscoveryCanRun = (status: DiscoveryStatus): void => {
  if (status.state === 'paused' || status.state === 'cancelled') {
    throw new Error(`Solid hydration discovery is ${status.state}`);
  }
};

const isDiscoverySettled = (status: DiscoveryStatus): boolean =>
  status.queuedJobs === 0 && status.inFlightJobs === 0;

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
