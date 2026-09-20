import { TestBed } from '@angular/core/testing';
import { SolidContainerProvisioningService } from './solid-container-provisioning.service';
import { SolidRuntimeService } from './solid-runtime.service';

describe('SolidContainerProvisioningService', () => {
  let ensureAppContainer: jasmine.Spy<(uri: string) => Promise<void>>;

  beforeEach(() => {
    ensureAppContainer = jasmine.createSpy('ensureAppContainer').and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SolidRuntimeService,
          useValue: {
            ensureAppContainer,
            client: {
              diagnostics: { status: () => ({ podUrl: 'https://pod.example/' }) },
            },
          },
        },
      ],
    });
  });

  it('deduplicates concurrent and completed provisioning for one target', async () => {
    const service = TestBed.inject(SolidContainerProvisioningService);
    const uri = 'https://pod.example/super-productivity/tasks/';

    await Promise.all([service.ensure(uri), service.ensure(uri)]);
    await service.ensure(uri);

    expect(ensureAppContainer).toHaveBeenCalledOnceWith(uri);
  });

  it('allows a failed target to retry without invalidating another target', async () => {
    const service = TestBed.inject(SolidContainerProvisioningService);
    const tasks = 'https://pod.example/super-productivity/tasks/';
    const notes = 'https://pod.example/super-productivity/notes/';
    ensureAppContainer.and.callFake((uri) =>
      uri === notes ? Promise.reject(new Error('notes unavailable')) : Promise.resolve(),
    );

    await service.ensure(tasks);
    await expectAsync(service.ensure(notes)).toBeRejected();
    ensureAppContainer.and.resolveTo();
    await service.ensure(notes);
    await service.ensure(tasks);

    expect(ensureAppContainer.calls.allArgs()).toEqual([[tasks], [notes], [notes]]);
  });
});
