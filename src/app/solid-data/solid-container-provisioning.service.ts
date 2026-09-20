import { inject, Injectable } from '@angular/core';
import { SolidRuntimeService } from './solid-runtime.service';

/** Deduplicates lazy container provisioning without coupling unrelated targets. */
@Injectable({ providedIn: 'root' })
export class SolidContainerProvisioningService {
  private readonly runtime = inject(SolidRuntimeService);
  private readonly provisioned = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  ensure(containerUri: string): Promise<void> {
    const key = this.key(containerUri);
    if (this.provisioned.has(key)) return Promise.resolve();
    const existing = this.pending.get(key);
    if (existing !== undefined) return existing;

    const provisioning = this.runtime
      .ensureAppContainer(containerUri)
      .then(() => {
        this.provisioned.add(key);
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, provisioning);
    return provisioning;
  }

  clear(): void {
    this.provisioned.clear();
    this.pending.clear();
  }

  private key(containerUri: string): string {
    return `${this.runtime.client.diagnostics.status().podUrl}|${containerUri}`;
  }
}
