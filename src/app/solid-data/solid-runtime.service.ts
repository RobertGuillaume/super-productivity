import { inject, Injectable } from '@angular/core';
import type {
  AuthSessionOptions,
  RuntimeBootOptions,
  RuntimeLayout,
  SolidRuntime,
} from '@solid-intents/runtime';
import {
  SOLID_PRODUCTIVITY_LAYOUT,
  SOLID_PRODUCTIVITY_TASK_TYPE,
} from './solid-productivity-vocab';
import { SOLID_RUNTIME } from './solid-runtime.token';

@Injectable({ providedIn: 'root' })
export class SolidRuntimeService {
  private readonly runtime = inject(SOLID_RUNTIME);
  private layout: RuntimeLayout | null = null;

  get client(): SolidRuntime {
    return this.runtime;
  }

  get taskProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_TASK_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_TASK_TYPE];
  }

  async boot(options: RuntimeBootOptions = {}): Promise<void> {
    await this.runtime.boot(options);
    this.ensureLayout();
  }

  async restoreSession(options: AuthSessionOptions = {}): Promise<void> {
    await this.runtime.auth.restoreSession({
      clientName: 'Super Productivity',
      redirectUrl: window.location.href,
      ...options,
    });
    this.ensureLayout();
  }

  async login(issuer: string): Promise<void> {
    await this.runtime.auth.login({
      issuer,
    });
  }

  ensureLayout(): RuntimeLayout {
    if (this.layout === null) {
      this.layout = this.runtime.layouts.define(SOLID_PRODUCTIVITY_LAYOUT);
    }

    return this.layout;
  }
}
