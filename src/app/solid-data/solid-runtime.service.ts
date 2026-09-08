import { inject, Injectable } from '@angular/core';
import { getSolidDataset, getThing, getUrlAll } from '@inrupt/solid-client';
import type {
  AuthState,
  AuthSessionOptions,
  RuntimeBootOptions,
  RuntimeLayout,
  SolidRuntime,
} from '@solid-intents/runtime';
import { Log } from '../core/log';
import {
  SOLID_PRODUCTIVITY_LAYOUT,
  SOLID_PRODUCTIVITY_APP_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE,
  SOLID_PRODUCTIVITY_ARCHIVED_TASK_TYPE,
  SOLID_PRODUCTIVITY_BOARD_TYPE,
  SOLID_PRODUCTIVITY_GLOBAL_CONFIG_TYPE,
  SOLID_PRODUCTIVITY_ISSUE_PROVIDER_TYPE,
  SOLID_PRODUCTIVITY_MENU_TREE_TYPE,
  SOLID_PRODUCTIVITY_METRIC_TYPE,
  SOLID_PRODUCTIVITY_NOTE_TYPE,
  SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE,
  SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_DAY_TYPE,
  SOLID_PRODUCTIVITY_PLANNER_STATE_TYPE,
  SOLID_PRODUCTIVITY_PROJECT_TYPE,
  SOLID_PRODUCTIVITY_SECTION_TYPE,
  SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
  SOLID_PRODUCTIVITY_TAG_TYPE,
  SOLID_PRODUCTIVITY_TASK_TYPE,
  SOLID_PRODUCTIVITY_TASK_REPEAT_CFG_TYPE,
  SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE,
} from './solid-productivity-vocab';
import { SOLID_RUNTIME } from './solid-runtime.token';
import { SolidStorageRootCacheService } from './solid-storage-root-cache.service';

const PIM_STORAGE = 'http://www.w3.org/ns/pim/space#storage';
const LDP_BASIC_CONTAINER = 'http://www.w3.org/ns/ldp#BasicContainer';

export type SolidStorageRootResolution = 'unchanged' | 'changed' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class SolidRuntimeService {
  private readonly runtime = inject(SOLID_RUNTIME);
  private readonly storageRootCache = inject(SolidStorageRootCacheService);
  private layout: RuntimeLayout | null = null;
  private layoutPodUrl: string | null = null;

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

  get archiveStateProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_ARCHIVE_STATE_TYPE];
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

  get menuTreeProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_MENU_TREE_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_MENU_TREE_TYPE];
  }

  get timeTrackingProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_TIME_TRACKING_TYPE];
  }

  get pluginUserDataProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_PLUGIN_USER_DATA_TYPE];
  }

  get pluginMetadataProfile(): RuntimeLayout['types'][typeof SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE] {
    return this.ensureLayout().types[SOLID_PRODUCTIVITY_PLUGIN_METADATA_TYPE];
  }

  async boot(options: RuntimeBootOptions = {}): Promise<void> {
    this.clearLayout();
    await this.runtime.boot(options);
    this.clearLayout();
    this.ensureLayout();
  }

  async restoreSession(options: AuthSessionOptions = {}): Promise<AuthState> {
    this.clearLayout();
    const state = await this.runtime.auth.restoreSession({
      clientName: 'Super Productivity',
      redirectUrl: window.location.href,
      ...options,
    });
    this.clearLayout();
    this.ensureLayout();
    await this.activateRememberedStorageRoot();
    return state;
  }

  async activateRememberedStorageRoot(): Promise<SolidStorageRootResolution> {
    const state = this.runtime.auth.state();
    if (state.status !== 'authenticated') {
      return 'unchanged';
    }

    const rememberedRoot = this.storageRootCache.get(state.webId);
    if (rememberedRoot === null) {
      return 'unchanged';
    }

    return this.activateStorageRoot(rememberedRoot);
  }

  async login(issuer: string): Promise<void> {
    await this.runtime.auth.login({
      issuer,
    });
  }

  async logout(): Promise<void> {
    await this.runtime.auth.logout();
    this.clearLayout();
  }

  ensureLayout(): RuntimeLayout {
    const podUrl = this.runtime.diagnostics.status().podUrl;

    if (this.layout === null || this.layoutPodUrl !== podUrl) {
      this.layout = this.runtime.layouts.define(SOLID_PRODUCTIVITY_LAYOUT);
      this.layoutPodUrl = podUrl;
    }

    return this.layout;
  }

  async ensureAppContainers(): Promise<void> {
    const layout = this.ensureLayout();
    const podUrl = normalizeContainerUrl(this.runtime.diagnostics.status().podUrl);
    const fetchResource = this.runtime.auth.fetch();
    const containerUris = collectContainerUris(podUrl, Object.values(layout.containers));

    for (const containerUri of containerUris) {
      await ensureContainer(fetchResource, containerUri);
    }
  }

  async ensureAppContainer(
    containerUri: string,
    knownExisting: Set<string> = new Set(),
  ): Promise<void> {
    const podUrl = normalizeContainerUrl(this.runtime.diagnostics.status().podUrl);
    const fetchResource = this.runtime.auth.fetch();
    const containerUris = collectContainerUris(podUrl, [containerUri]);

    for (const uri of containerUris) {
      if (!knownExisting.has(uri)) {
        await ensureContainer(fetchResource, uri, uri === containerUri);
        knownExisting.add(uri);
      }
    }
  }

  rememberAppContainerTree(containerUri: string, knownExisting: Set<string>): void {
    const podUrl = normalizeContainerUrl(this.runtime.diagnostics.status().podUrl);
    for (const uri of collectContainerUris(podUrl, [containerUri])) {
      knownExisting.add(uri);
    }
  }

  /**
   * Resolves the WebID storage root after cached catalog hydration. Profile failures are
   * intentionally nonfatal: callers can keep displaying the currently booted catalog.
   */
  async resolveAuthenticatedStorageRoot(): Promise<SolidStorageRootResolution> {
    const state = this.runtime.auth.state();
    if (state.status !== 'authenticated') {
      return 'unchanged';
    }

    const storageRoot = await this.discoverStorageRoot(state.webId);
    if (storageRoot === null) {
      return 'unavailable';
    }

    const currentPodUrl = this.runtime.diagnostics.status().podUrl;
    this.storageRootCache.remember(state.webId, storageRoot);
    if (normalizeContainerUrl(currentPodUrl) === storageRoot) {
      return 'unchanged';
    }

    return this.activateStorageRoot(storageRoot);
  }

  private async activateStorageRoot(
    storageRoot: string,
  ): Promise<SolidStorageRootResolution> {
    const currentPodUrl = normalizeContainerUrl(this.runtime.diagnostics.status().podUrl);
    if (currentPodUrl === storageRoot) {
      return 'unchanged';
    }

    await this.runtime.boot({ podUrl: storageRoot, fetch: this.runtime.auth.fetch() });
    this.clearLayout();
    this.ensureLayout();
    return 'changed';
  }

  private clearLayout(): void {
    this.layout = null;
    this.layoutPodUrl = null;
  }

  private async discoverStorageRoot(webId: string): Promise<string | null> {
    try {
      const profileDataset = await getSolidDataset(webId, {
        fetch: this.runtime.auth.fetch(),
      });
      const profileThing = getThing(profileDataset, webId);
      const storageRoots =
        profileThing === null ? [] : getUrlAll(profileThing, PIM_STORAGE);
      const storageRoot = storageRoots[0];

      return storageRoot === undefined ? null : normalizeContainerUrl(storageRoot);
    } catch (error) {
      Log.err('SolidRuntimeService: Failed to discover Solid storage root', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      return null;
    }
  }
}

const normalizeContainerUrl = (uri: string): string =>
  uri.endsWith('/') ? uri : `${uri}/`;

const collectContainerUris = (podUrl: string, appContainerUris: string[]): string[] => {
  const rootUrl = new URL(podUrl);
  const containerUris = new Set<string>();

  for (const containerUri of appContainerUris) {
    const parsedContainer = new URL(containerUri);
    const containerPath = normalizeContainerPath(parsedContainer.pathname);
    const rootPath = normalizeContainerPath(rootUrl.pathname);

    if (
      parsedContainer.origin !== rootUrl.origin ||
      !containerPath.startsWith(rootPath)
    ) {
      containerUris.add(normalizeContainerUrl(parsedContainer.toString()));
      continue;
    }

    const relativePath = containerPath.slice(rootPath.length);
    const segments = relativePath.split('/').filter(Boolean);
    let currentPath = rootPath;

    for (const segment of segments) {
      currentPath = `${currentPath}${segment}/`;
      const currentUrl = new URL(rootUrl.toString());
      currentUrl.pathname = currentPath;
      currentUrl.search = '';
      currentUrl.hash = '';
      containerUris.add(currentUrl.toString());
    }
  }

  return [...containerUris].sort((a, b) => a.length - b.length);
};

const normalizeContainerPath = (path: string): string =>
  path.endsWith('/') ? path : `${path}/`;

const ensureContainer = async (
  fetchResource: typeof fetch,
  containerUri: string,
  isKnownMissing = false,
): Promise<void> => {
  if (!isKnownMissing) {
    const existing = await fetchResource(containerUri, { method: 'HEAD' });
    if (existing.ok) {
      return;
    }

    if (existing.status !== 404 && existing.status !== 410 && existing.status !== 405) {
      throw new Error(`Failed to inspect Solid container: HTTP ${existing.status}`);
    }

    if (
      existing.status === 405 &&
      (await canReadContainer(fetchResource, containerUri))
    ) {
      return;
    }
  }

  const created = await fetchResource(containerUri, {
    method: 'PUT',
    headers: new Headers([['Link', `<${LDP_BASIC_CONTAINER}>; rel="type"`]]),
  });

  if (created.ok || created.status === 201) {
    return;
  }

  if (created.status === 409 && (await canReadContainer(fetchResource, containerUri))) {
    return;
  }

  throw new Error(`Failed to create Solid container: HTTP ${created.status}`);
};

const canReadContainer = async (
  fetchResource: typeof fetch,
  containerUri: string,
): Promise<boolean> => {
  const response = await fetchResource(containerUri, { method: 'GET' });
  return response.ok;
};
