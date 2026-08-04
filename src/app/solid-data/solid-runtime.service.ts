import { inject, Injectable } from '@angular/core';
import type {
  AuthSessionOptions,
  RuntimeBootOptions,
  RuntimeLayout,
  SolidRuntime,
} from '@solid-intents/runtime';
import {
  SOLID_PRODUCTIVITY_LAYOUT,
  SOLID_PRODUCTIVITY_APP_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
  SOLID_PRODUCTIVITY_BOARD_TYPE,
  SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
  SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
  SOLID_PRODUCTIVITY_METRIC_TYPE,
  SOLID_PRODUCTIVITY_NOTE_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
  SOLID_PRODUCTIVITY_PROJECT_TYPE,
  SOLID_PRODUCTIVITY_SECTION_TYPE,
  SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
  SOLID_PRODUCTIVITY_TAG_TYPE,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
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

  get projectProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_PROJECT_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_PROJECT_TYPE];
  }

  get tagProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_TAG_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_TAG_TYPE];
  }

  get noteProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_NOTE_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_NOTE_TYPE];
  }

  get appStateProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_APP_STATE_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_APP_STATE_TYPE];
  }

  get sectionProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_SECTION_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_SECTION_TYPE];
  }

  get issueProviderProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE];
  }

  get taskRepeatCfgProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE];
  }

  get archivedTaskProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE];
  }

  get plannerDayProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE];
  }

  get plannerStateProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE];
  }

  get simpleCounterProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE];
  }

  get metricProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_METRIC_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_METRIC_TYPE];
  }

  get boardProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_BOARD_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_BOARD_TYPE];
  }

  get globalConfigProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE];
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
