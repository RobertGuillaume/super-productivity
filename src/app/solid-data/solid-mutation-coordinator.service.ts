import { computed, Injectable, signal } from '@angular/core';

const GLOBAL_MUTATION_KEY = 'solid:*';

/** Serializes mutations per resource while allowing unrelated resources to overlap. */
@Injectable({ providedIn: 'root' })
export class SolidMutationCoordinator {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly inFlightCountSignal = signal(0);

  readonly inFlightCount = this.inFlightCountSignal.asReadonly();
  readonly hasInFlight = computed(() => this.inFlightCountSignal() > 0);

  run<Result>(
    resourceKeys: string | readonly string[],
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const keys = normalizeKeys(resourceKeys);
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
    this.inFlightCountSignal.update((count) => count + 1);

    return ready.then(async () => {
      try {
        return await operation();
      } finally {
        this.inFlightCountSignal.update((count) => count - 1);
        releaseReservation?.();
        for (const key of keys) {
          if (this.tails.get(key) === reservation) {
            this.tails.delete(key);
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
