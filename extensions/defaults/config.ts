/**
 * Configuration for the defaults extension.
 *
 * DefaultsConfig is the user-facing schema (all fields optional).
 * ResolvedDefaultsConfig is the internal schema (all fields required, defaults applied).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface DefaultsConfig {
  catalog?: string[];
  catalogDepth?: number;
  childProjectDepth?: number;
}

export interface ResolvedDefaultsConfig {
  catalog: string[];
  catalogDepth: number;
  childProjectDepth: number;
}

const DEFAULT_CONFIG: ResolvedDefaultsConfig = {
  catalog: [],
  catalogDepth: 3,
  childProjectDepth: 2,
};

export const configLoader = new ConfigLoader<
  DefaultsConfig,
  ResolvedDefaultsConfig
>("defaults", DEFAULT_CONFIG, {
  scopes: ["global"],
});
