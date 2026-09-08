import { TestBed } from '@angular/core/testing';
import type { AuthState, SolidRuntime } from '@solid-intents/runtime';
import { SolidNativeTaskIndexService } from './solid-native-task-index.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidNativeTaskIndexService', () => {
  const webId = 'https://pod.example/profile/card#me';
  let authState: AuthState;
  let authenticatedFetch: jasmine.Spy;
  let verifiedTypeIndexUris: readonly string[] | null;

  beforeEach(() => {
    authState = { status: 'authenticated', webId };
    authenticatedFetch = jasmine.createSpy('authenticatedFetch');
    verifiedTypeIndexUris = ['https://pod.example/settings/publicTypeIndex.ttl'];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            getVerifiedTypeIndexUris: () => verifiedTypeIndexUris,
            client: {
              auth: {
                state: () => authState,
                fetch: () => authenticatedFetch,
              },
            } as unknown as SolidRuntime,
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reads only explicit VTODO resources and containers from type indexes', async () => {
    authenticatedFetch.and.callFake(async (input: RequestInfo | URL) => {
      const uri = input.toString().replace(/#.*$/, '');
      if (uri === 'https://pod.example/settings/publicTypeIndex.ttl') {
        return turtleResponse(`
          @prefix solid: <http://www.w3.org/ns/solid/terms#>.
          <https://pod.example/settings/publicTypeIndex.ttl#tasks>
            solid:forClass <http://www.w3.org/2002/12/cal/ical#Vtodo>;
            solid:instance <https://pod.example/calendar/one.ttl#todo>;
            solid:instanceContainer <https://pod.example/calendar/tasks>.
          <https://pod.example/settings/publicTypeIndex.ttl#contacts>
            solid:forClass <http://xmlns.com/foaf/0.1/Person>;
            solid:instance <https://pod.example/contacts/person.ttl#me>.
        `);
      }
      return turtleResponse('', 404);
    });

    const result = await TestBed.inject(SolidNativeTaskIndexService).readTargets();

    expect(result).toEqual({
      resourceUris: ['https://pod.example/calendar/one.ttl'],
      containerUris: ['https://pod.example/calendar/tasks/'],
      diagnosticCount: 0,
    });
  });

  it('returns no targets when the profile has no type index', async () => {
    verifiedTypeIndexUris = [];

    const result = await TestBed.inject(SolidNativeTaskIndexService).readTargets();

    expect(result).toEqual({
      resourceUris: [],
      containerUris: [],
      diagnosticCount: 0,
    });
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('does not request a type index before the profile is verified', async () => {
    verifiedTypeIndexUris = null;

    const result = await TestBed.inject(SolidNativeTaskIndexService).readTargets();

    expect(result.diagnosticCount).toBe(1);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('reports an inaccessible advertised index without broad discovery', async () => {
    authenticatedFetch.and.resolveTo(turtleResponse('', 503));

    const result = await TestBed.inject(SolidNativeTaskIndexService).readTargets();

    expect(result.resourceUris).toEqual([]);
    expect(result.containerUris).toEqual([]);
    expect(result.diagnosticCount).toBe(1);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });
});

const turtleResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: new Headers([['Content-Type', 'text/turtle']]),
  });
