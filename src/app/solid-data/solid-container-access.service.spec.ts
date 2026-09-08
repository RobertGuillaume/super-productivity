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
  let permissions: jasmine.Spy;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    authenticatedFetch = jasmine.createSpy('fetch');
    permissions = jasmine.createSpy('permissions');
    const runtime = {
      auth: {
        state: (): AuthState => authState,
        fetch: (): typeof fetch => authenticatedFetch,
      },
      share: { permissions },
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

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toBe(
      'writable',
    );
    expect(permissions).not.toHaveBeenCalled();

    authenticatedFetch.and.resolveTo(
      response(200, new Headers([['wac-allow', 'user="read append"']])),
    );
    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toBe(
      'read-only',
    );
  });

  it('falls back to an exact WebID permission when the header is ambiguous', async () => {
    authenticatedFetch.and.resolveTo(response(200));
    permissions.and.resolveTo([
      { agent: 'https://someone.example/#me', read: true, write: true },
      { agent: webId, read: true, write: true },
    ]);

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toBe(
      'writable',
    );
    expect(permissions).toHaveBeenCalledOnceWith(containerUri);
  });

  it('keeps empty and failed permission results blocked', async () => {
    authenticatedFetch.and.resolveTo(response(200));
    permissions.and.resolveTo([]);
    const service = TestBed.inject(SolidContainerAccessService);

    expect(await service.check(containerUri)).toBe('read-only');

    permissions.and.rejectWith(new Error('permission unavailable'));
    expect(await service.check(containerUri)).toBe('read-only');
  });

  it('marks connectivity failures unavailable', async () => {
    authenticatedFetch.and.rejectWith(new TypeError('offline'));

    expect(await TestBed.inject(SolidContainerAccessService).check(containerUri)).toBe(
      'unavailable',
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
