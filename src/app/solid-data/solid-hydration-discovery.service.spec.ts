import { TestBed } from '@angular/core/testing';
import type {
  ContainerListing,
  DiscoveryStatus,
  SolidRuntime,
} from '@solid-intents/runtime';
import { SolidHydrationDiscoveryService } from './solid-hydration-discovery.service';
import { SOLID_PRODUCTIVITY_TASK_TYPE } from './solid-productivity-vocab';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidHydrationDiscoveryService', () => {
  const tasksContainer = 'https://pod.example/super-productivity/tasks/';
  const projectsContainer = 'https://pod.example/super-productivity/projects/';
  let status: DiscoveryStatus;
  let discovery: {
    refresh: jasmine.Spy;
    discoverType: jasmine.Spy;
    start: jasmine.Spy;
    status: jasmine.Spy;
  };
  let storage: {
    listContainer: jasmine.Spy;
  };
  let things: {
    query: jasmine.Spy;
  };
  let callOrder: string[];

  beforeEach(() => {
    status = discoveryStatus();
    discovery = jasmine.createSpyObj('discovery', [
      'refresh',
      'discoverType',
      'start',
      'status',
    ]);
    discovery.status.and.callFake(() => status);
    callOrder = [];
    discovery.refresh.and.callFake(async () => {
      callOrder.push('refresh');
    });
    discovery.discoverType.and.callFake(async () => {
      callOrder.push('discoverType');
    });
    discovery.start.and.resolveTo(undefined);
    storage = jasmine.createSpyObj('storage', ['listContainer']);
    storage.listContainer.and.callFake(async (uri: string) =>
      containerListing(uri, uri === tasksContainer ? ['task-1.ttl', 'task-2.ttl'] : []),
    );
    things = jasmine.createSpyObj('things', ['query']);
    things.query.and.callFake(
      async (_query: unknown, options: { scope: { uri: string } }) => {
        const resourceNames =
          options.scope.uri === tasksContainer ? ['task-1.ttl', 'task-2.ttl'] : [];
        return {
          things: resourceNames.map((resourceName) => ({
            source: { uri: `${options.scope.uri}${resourceName}` },
            content: { uri: `${options.scope.uri}${resourceName}` },
          })),
        };
      },
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            client: { discovery, storage, things } as unknown as SolidRuntime,
            ensureLayout: () => ({
              containers: {
                tasks: tasksContainer,
                projects: projectsContainer,
              },
            }),
          } as unknown as SolidRuntimeService,
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('indexes every listed app resource before discovering Pod-wide tasks', async () => {
    await TestBed.inject(SolidHydrationDiscoveryService).prepare();

    expect(storage.listContainer).toHaveBeenCalledTimes(2);
    expect(discovery.refresh).toHaveBeenCalledOnceWith({
      uris: [
        tasksContainer,
        projectsContainer,
        `${tasksContainer}task-1.ttl`,
        `${tasksContainer}task-2.ttl`,
      ],
    });
    expect(discovery.discoverType).toHaveBeenCalledOnceWith(SOLID_PRODUCTIVITY_TASK_TYPE);
    expect(things.query).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(['refresh', 'discoverType']);
  });

  it('keeps running bounded discovery until all queued resources are indexed', async () => {
    status = discoveryStatus({ queuedJobs: 130, completedJobs: 100 });
    discovery.start.and.callFake(async () => {
      status =
        discovery.start.calls.count() === 1
          ? discoveryStatus({ queuedJobs: 30, completedJobs: 200 })
          : discoveryStatus({ completedJobs: 230 });
    });

    await TestBed.inject(SolidHydrationDiscoveryService).prepare();

    expect(discovery.start).toHaveBeenCalledTimes(2);
  });

  it('rejects an unreadable app container instead of hydrating partial data', async () => {
    storage.listContainer.and.callFake(async (uri: string) =>
      uri === projectsContainer
        ? containerListing(uri, [], 'inaccessible', 403)
        : containerListing(uri),
    );

    await expectAsync(
      TestBed.inject(SolidHydrationDiscoveryService).prepare(),
    ).toBeRejectedWithError(/could not read 1 application container.*HTTP 403/);
    expect(discovery.refresh).not.toHaveBeenCalled();
  });

  it('rejects hydration when a listed resource was not indexed', async () => {
    things.query.and.resolveTo({ things: [] });

    await expectAsync(
      TestBed.inject(SolidHydrationDiscoveryService).prepare(),
    ).toBeRejectedWithError(/did not index 2 of 2 application resource/);
    expect(discovery.discoverType).not.toHaveBeenCalled();
  });
});

const discoveryStatus = (overrides: Partial<DiscoveryStatus> = {}): DiscoveryStatus => ({
  state: 'idle',
  queuedJobs: 0,
  inFlightJobs: 0,
  completedJobs: 0,
  maxConcurrentJobs: 3,
  ...overrides,
});

const containerListing = (
  uri: string,
  resourceNames: readonly string[] = [],
  status: ContainerListing['status'] = 'ok',
  httpStatus = 200,
): ContainerListing => ({
  uri,
  status,
  entries: resourceNames.map((resourceName) => ({
    uri: `${uri}${resourceName}`,
    kind: 'resource',
  })),
  readAt: new Date(0),
  httpStatus,
  contentType: 'text/turtle',
});
