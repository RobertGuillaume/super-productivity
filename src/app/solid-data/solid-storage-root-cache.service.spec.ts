import { TestBed } from '@angular/core/testing';
import {
  SOLID_STORAGE_ROOT_CACHE_KEY,
  SolidStorageRootCacheService,
} from './solid-storage-root-cache.service';

describe('SolidStorageRootCacheService', () => {
  afterEach(() => {
    localStorage.removeItem(SOLID_STORAGE_ROOT_CACHE_KEY);
    TestBed.resetTestingModule();
  });

  it('stores normalized roots by WebID', () => {
    const service = TestBed.inject(SolidStorageRootCacheService);

    service.remember('https://id.example/profile#me', 'https://pod.example/storage');

    expect(service.get('https://id.example/profile#me')).toBe(
      'https://pod.example/storage/',
    );
  });

  it('ignores corrupt and unsafe cached roots', () => {
    const service = TestBed.inject(SolidStorageRootCacheService);
    const webId = 'https://id.example/profile#me';
    localStorage.setItem(SOLID_STORAGE_ROOT_CACHE_KEY, '{broken');
    expect(service.get(webId)).toBeNull();

    localStorage.setItem(
      SOLID_STORAGE_ROOT_CACHE_KEY,
      JSON.stringify({ [webId]: 'javascript:alert(1)' }),
    );
    expect(service.get(webId)).toBeNull();
  });

  it('forgets one WebID without removing another', () => {
    const service = TestBed.inject(SolidStorageRootCacheService);
    service.remember('https://id.example/one#me', 'https://pod.example/one/');
    service.remember('https://id.example/two#me', 'https://pod.example/two/');

    service.forget('https://id.example/one#me');

    expect(service.get('https://id.example/one#me')).toBeNull();
    expect(service.get('https://id.example/two#me')).toBe('https://pod.example/two/');
  });
});
