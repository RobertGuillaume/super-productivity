import { Injectable } from '@angular/core';

export const SOLID_STORAGE_ROOT_CACHE_KEY = 'SUP_SOLID_VERIFIED_STORAGE_ROOTS_V1';

@Injectable({ providedIn: 'root' })
export class SolidStorageRootCacheService {
  get(webId: string): string | null {
    const entries = this.readEntries();
    return entries[webId] ?? null;
  }

  remember(webId: string, root: string): void {
    const normalizedRoot = normalizeStorageRoot(root);
    if (normalizedRoot === null || typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      SOLID_STORAGE_ROOT_CACHE_KEY,
      JSON.stringify({ ...this.readEntries(), [webId]: normalizedRoot }),
    );
  }

  forget(webId: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const entries = this.readEntries();
    delete entries[webId];
    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(SOLID_STORAGE_ROOT_CACHE_KEY);
      return;
    }
    localStorage.setItem(SOLID_STORAGE_ROOT_CACHE_KEY, JSON.stringify(entries));
  }

  private readEntries(): Record<string, string> {
    if (typeof localStorage === 'undefined') {
      return {};
    }

    const raw = localStorage.getItem(SOLID_STORAGE_ROOT_CACHE_KEY);
    if (raw === null) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed).flatMap(([webId, root]) => {
          const normalizedRoot =
            typeof root === 'string' ? normalizeStorageRoot(root) : null;
          return normalizedRoot === null ? [] : [[webId, normalizedRoot]];
        }),
      );
    } catch {
      return {};
    }
  }
}

export const normalizeStorageRoot = (root: string): string | null => {
  try {
    const parsed = new URL(root);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().endsWith('/') ? parsed.toString() : `${parsed.toString()}/`;
  } catch {
    return null;
  }
};
