import { computed, inject, Injectable, signal } from '@angular/core';
import { SolidMutationIntentRegistry } from './solid-mutation-intent-registry.service';

const GLOBAL_MUTATION_KEY = 'solid:*';

/** Serializes mutations per resource while allowing unrelated resources to overlap. */
@Injectable({ providedIn: 'root' })
export class SolidMutationCoordinator {
  private readonly intents = inject(SolidMutationIntentRegistry);
  private readonly tails = new Map<string, Promise<void>>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly failedIntentReleases = new Map<object, Set<() => void>>();
  private readonly failedErrorReleases = new WeakMap<object, () => void>();
  private readonly inFlightCountSignal = signal(0);

  readonly inFlightCount = this.inFlightCountSignal.asReadonly();
  readonly hasInFlight = computed(() => this.inFlightCountSignal() > 0);

  run<Result>(
    resourceKeys: string | readonly string[],
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const keys = normalizeKeys(resourceKeys);
    const intent = this.intents.latest();
    const predecessors = keys.map((key) =>
      (this.tails.get(key) ?? Promise.resolve()).catch(() => undefined),
    );
    const ready = Promise.all(predecessors).then(() => undefined);
    let releaseReservation: (() => void) | undefined;
    const reservationComplete = new Promise<void>((resolve) => {
      releaseReservation = resolve;
    });
    const reservation = ready.then(() => reservationComplete);

    for (const key of keys) {
      this.tails.set(key, reservation);
    }
    return ready.then(async () => {
      this.inFlightCountSignal.update((count) => count + 1);
      let didFail = false;
      try {
        return await operation();
      } catch (error) {
        didFail = true;
        this.intents.associateFailure(error, intent);
        if (intent !== null) {
          const releases = this.failedIntentReleases.get(intent.action) ?? new Set();
          releases.add(() => releaseReservation?.());
          this.failedIntentReleases.set(intent.action, releases);
        } else if (typeof error === 'object' && error !== null) {
          this.failedErrorReleases.set(error, () => releaseReservation?.());
        }
        throw error;
      } finally {
        this.inFlightCountSignal.update((count) => count - 1);
        if (!didFail) {
          releaseReservation?.();
          for (const key of keys) {
            if (this.tails.get(key) === reservation) {
              this.tails.delete(key);
            }
          }
        }
        if (this.inFlightCountSignal() === 0) {
          for (const resolve of this.idleWaiters) {
            resolve();
          }
          this.idleWaiters.clear();
        }
      }
    });
  }

  completeFailedIntent(action: object | null, error: unknown): void {
    if (action !== null) {
      const releases = this.failedIntentReleases.get(action);
      releases?.forEach((release) => release());
      this.failedIntentReleases.delete(action);
      return;
    }
    if (typeof error === 'object' && error !== null) {
      this.failedErrorReleases.get(error)?.();
      this.failedErrorReleases.delete(error);
    }
  }

  whenIdle(): Promise<void> {
    if (!this.hasInFlight()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }
}

export const settleSolidMutations = async <T extends readonly unknown[]>(
  mutations: T,
): Promise<{ -readonly [Index in keyof T]: Awaited<T[Index]> }> => {
  const settled = await Promise.allSettled(mutations);
  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed !== undefined) {
    throw failed.reason;
  }

  return settled.map((result) =>
    result.status === 'fulfilled' ? result.value : undefined,
  ) as { -readonly [Index in keyof T]: Awaited<T[Index]> };
};

export const solidMutationKey = (model: string, id: string): string => `${model}:${id}`;

const normalizeKeys = (resourceKeys: string | readonly string[]): string[] => {
  const keys = typeof resourceKeys === 'string' ? [resourceKeys] : resourceKeys;
  const unique = Array.from(new Set(keys));
  unique.sort();
  return unique.length === 0 ? [GLOBAL_MUTATION_KEY] : unique;
};
