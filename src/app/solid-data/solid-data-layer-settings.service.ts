import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_SOLID_DATA_LAYER_ISSUER,
  isSolidDataLayerEnabled,
  isSolidDataLayerPrimaryEnabled,
  SOLID_DATA_LAYER_ENABLED_STORAGE_KEY,
  SOLID_DATA_LAYER_ISSUER_STORAGE_KEY,
  SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY,
} from './solid-data-layer-feature-flag';

@Injectable({ providedIn: 'root' })
export class SolidDataLayerSettingsService {
  readonly isEnabled = signal(isSolidDataLayerEnabled());
  readonly isPrimaryEnabled = signal(isSolidDataLayerPrimaryEnabled());
  readonly issuer = signal(this.getStoredIssuer());

  setEnabled(isEnabled: boolean): void {
    this.setStorageFlag(SOLID_DATA_LAYER_ENABLED_STORAGE_KEY, isEnabled);
    this.isEnabled.set(isSolidDataLayerEnabled());

    if (!isEnabled) {
      this.setPrimaryEnabled(false);
    }
  }

  setPrimaryEnabled(isEnabled: boolean): void {
    this.setStorageFlag(SOLID_DATA_LAYER_PRIMARY_ENABLED_STORAGE_KEY, isEnabled);
    this.isPrimaryEnabled.set(isSolidDataLayerPrimaryEnabled());
  }

  setIssuer(issuer: string): void {
    const normalizedIssuer = issuer.trim() || DEFAULT_SOLID_DATA_LAYER_ISSUER;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY, normalizedIssuer);
    }
    this.issuer.set(normalizedIssuer);
  }

  private getStoredIssuer(): string {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_SOLID_DATA_LAYER_ISSUER;
    }

    return (
      localStorage.getItem(SOLID_DATA_LAYER_ISSUER_STORAGE_KEY)?.trim() ||
      DEFAULT_SOLID_DATA_LAYER_ISSUER
    );
  }

  private setStorageFlag(key: string, value: boolean): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (value) {
      localStorage.setItem(key, 'true');
    } else {
      localStorage.removeItem(key);
    }
  }
}
