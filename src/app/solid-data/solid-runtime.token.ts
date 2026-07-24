import { InjectionToken } from '@angular/core';
import { SolidGraphRuntime } from '@solid-intents/runtime';
import type { SolidRuntime } from '@solid-intents/runtime';

export const SOLID_RUNTIME = new InjectionToken<SolidRuntime>('SOLID_RUNTIME', {
  providedIn: 'root',
  factory: () => new SolidGraphRuntime(),
});
