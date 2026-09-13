import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { SolidContainerAccessService } from './solid-container-access.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidContainerAccessService', () => {
  const containerUri = 'https://pod.example/tasks/';
  const webId = 'https://user.example/profile#me';
  let authState: AuthState;
  let resolvePermissions: jasmine.Spy;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    resolvePermissions = jasmine.createSpy('resolvePermissions');
    const runtime = {
      auth: { state: (): AuthState => authState },
      share: { resolvePermissions },
    } as unknown as SolidRuntime;
    TestBed.configureTestingModule({
      providers: [{ provide: SolidRuntimeService, useValue: { client: runtime } }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('requires a proven write grant for the authenticated WebID', async () => {
    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'fallback-acl',
      permissions: [
        { agent: 'https://someone.example/#me', read: true, write: true },
        { agent: webId, read: true, write: true },
      ],
    });
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'writable' },
    );

    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'resource-acl',
      permissions: [{ agent: webId, read: true, write: false }],
    });
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'read-only' },
    );
  });

  it('blocks unknown, deferred and inaccessible permission evidence', async () => {
    resolvePermissions.and.resolveTo({
      status: 'unknown',
      permissions: [],
      reason: 'unsupported-access-model',
    });
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'unknown' },
    );

    resolvePermissions.and.rejectWith(new Error('permission unavailable'));
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'unavailable' },
    );
  });

  it('preserves runtime rate-limit scheduling', async () => {
    const retryAt = new Date('2026-09-08T14:00:00.000Z');
    resolvePermissions.and.resolveTo({
      status: 'unknown',
      permissions: [],
      reason: 'rate-limited',
      retryAt,
    });
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'rate-limited', retryAt },
    );
  });
});
