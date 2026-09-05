import {
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';

describe('solidDataLayerFeatureFlag', () => {
  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
  });

  it('is disabled by default', () => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);

    expect(isSolidDataLayerEnabled()).toBe(false);
  });

  it('is enabled from local storage', () => {
    localStorage.setItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, 'true');

    expect(isSolidDataLayerEnabled()).toBe(true);
  });

  it('tracks primary Solid data layer mode separately', () => {
    expect(isSolidDataLayerPrimaryEnabled()).toBe(false);

    localStorage.setItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, 'true');

    expect(isSolidDataLayerPrimaryEnabled()).toBe(true);
  });
});
