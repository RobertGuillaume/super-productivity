import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import {
  accessFromWacAllow,
  SolidContainerAccessService,
} from './solid-container-access.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidContainerAccessService', () => {
  const containerUri = 'https://pod.example/tasks/';
  const webId = 'https://user.example/profile#me';
  let authState: AuthState;
  let authenticatedFetch: jasmine.Spy;
  let resolvePermissions: jasmine.Spy;
  let requestScheduling: Array<{ origin: string; cooldownUntil: Date | null }>;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    authenticatedFetch = jasmine.createSpy('fetch');
    resolvePermissions = jasmine.createSpy('resolvePermissions');
    requestScheduling = [];
    const runtime = {
      auth: {
        state: (): AuthState => authState,
        fetch: (): typeof fetch => authenticatedFetch,
      },
      share: { resolvePermissions },
      diagnostics: {
        status: () => ({ requestScheduling }),
      },
    } as unknown as SolidRuntime;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: { client: runtime },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('requires explicit user write permission from WAC-Allow', async () => {
    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['WAC-Allow', 'public="read", User="read write"']])),
    );

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'writable' },
    );
    expect(resolvePermissions).not.toHaveBeenCalled();

    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['wac-allow', 'user="read append"']])),
    );
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'read-only' },
    );
  });

  it('accepts exact WebID permissions with effective ACL provenance', async () => {
    authenticatedFetch.and.resolveTo(response(200));
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
    expect(resolvePermissions).toHaveBeenCalledOnceWith(containerUri);
  });

  it('distinguishes explicit denial from unknown access', async () => {
    authenticatedFetch.and.resolveTo(response(200));
    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'resource-acl',
      permissions: [{ agent: webId, read: true, write: false }],
    });
    const service = TestBed.inject(SolidContainerAccessService);

    expect(await service.check(containerUri)).toEqual({ state: 'read-only' });

    resolvePermissions.and.resolveTo({
      status: 'known',
      provenance: 'resource-acl',
      permissions: [],
    });
    expect(await service.check(containerUri)).toEqual({ state: 'unknown' });

    resolvePermissions.and.resolveTo({
      status: 'unknown',
      permissions: [],
      reason: 'unsupported-access-model',
    });
    expect(await service.check(containerUri)).toEqual({ state: 'unknown' });

    resolvePermissions.and.rejectWith(new Error('permission unavailable'));
    expect(await service.check(containerUri)).toEqual({ state: 'unknown' });
  });

  it('preserves structured rate limiting for a later retry', async () => {
    const retryAt = new Date('2026-09-08T14:00:00.000Z');
    authenticatedFetch.and.resolveTo(response(200));
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

  it('uses the runtime cooldown after a final HEAD 429', async () => {
    const retryAt = new Date('2026-09-08T14:00:00.000Z');
    requestScheduling = [{ origin: 'https://pod.example', cooldownUntil: retryAt }];
    authenticatedFetch.and.resolveTo(response(429));

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'rate-limited', retryAt },
    );
    expect(resolvePermissions).not.toHaveBeenCalled();
  });

  it('marks connectivity failures unavailable', async () => {
    authenticatedFetch.and.rejectWith(new TypeError('offline'));

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toEqual(
      { state: 'unavailable' },
    );
  });

  it('parses WAC-Allow case-insensitively', () => {
    expect(accessFromWacAllow('Public="read", UsEr="READ WRITE"')).toBe('writable');
    expect(accessFromWacAllow('user="read append"')).toBe('read-only');
    expect(accessFromWacAllow('public="read"')).toBeNull();
  });
});

const response = (status: number, headers?: HeadersInit): Response =>
  new Response(null, { status, headers });
