import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_SOLID_DATA_LAYER_ISSUER,
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_ISSUER_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';
import { SolidDataLayerSettingsService } from './solid-data-layer-settings.service';

describe('SolidDataLayerSettingsService', () => {
  afterEach(() => {
    localStorage.removeItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY);
    localStorage.removeItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('stores Solid boot and primary mode separately', () => {
    const service = TestBed.inject(SolidDataLayerSettingsService);

    service.setEnabled(true);

    expect(service.isEnabled()).toBe(true);
    expect(service.isPrimaryEnabled()).toBe(false);
    expect(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY)).toBe('true');
    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(null);

    service.setPrimaryEnabled(true);

    expect(service.isPrimaryEnabled()).toBe(true);
    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(
      'true',
    );
  });

  it('disables primary mode when Solid boot is disabled', () => {
    const service = TestBed.inject(SolidDataLayerSettingsService);

    service.setEnabled(true);
    service.setPrimaryEnabled(true);
    service.setEnabled(false);

    expect(service.isEnabled()).toBe(false);
    expect(service.isPrimaryEnabled()).toBe(false);
    expect(localStorage.getItem(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY)).toBe(null);
    expect(localStorage.getItem(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY)).toBe(null);
  });

  it('persists the issuer with the default as the blank fallback', () => {
    const service = TestBed.inject(SolidDataLayerSettingsService);

    service.setIssuer(' https://issuer.example ');

    expect(service.issuer()).toBe('https://issuer.example');
    expect(localStorage.getItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY)).toBe(
      'https://issuer.example',
    );

    service.setIssuer(' ');

    expect(service.issuer()).toBe(DEFAULT_SOLID_DATA_LAYER_ISSUER);
    expect(localStorage.getItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY)).toBe(
      DEFAULT_SOLID_DATA_LAYER_ISSUER,
    );
  });
});
