/**
 * Configuration for the example extension.
 *
 * Demonstrates:
 * - Partial (user-facing) vs resolved (internal) config types
 * - Multiple scopes (global + local)
 * - Migrations for schema evolution
 * - afterMerge hook for custom merge logic
 */

import { ConfigLoader, type Migration } from "@aliou/pi-utils-settings";

// --- User-facing config (all optional, stored on disk) ---

export interface ExampleConfig {
  appearance?: {
    theme?: string;
    fontSize?: number;
    showLineNumbers?: boolean;
  };
  editor?: {
    autoSave?: boolean;
    formatOnSave?: boolean;
    tabSize?: number;
  };
  favorites?: string[];
  ignorePaths?: string[];
}

// --- Resolved config (all required, defaults applied) ---

export interface ResolvedExampleConfig {
  appearance: {
    theme: string;
    fontSize: number;
    showLineNumbers: boolean;
  };
  editor: {
    autoSave: boolean;
    formatOnSave: boolean;
    tabSize: number;
  };
  favorites: string[];
  ignorePaths: string[];
}

// --- Defaults ---

const DEFAULT_CONFIG: ResolvedExampleConfig = {
  appearance: {
    theme: "dark",
    fontSize: 14,
    showLineNumbers: true,
  },
  editor: {
    autoSave: false,
    formatOnSave: true,
    tabSize: 2,
  },
  favorites: [],
  ignorePaths: [],
};

// --- Migrations ---

const migrations: Migration<ExampleConfig>[] = [
  {
    name: "rename-font-size",
    shouldRun: (config) => "fontsize" in (config.appearance ?? {}),
    run: (config) => {
      const appearance = config.appearance ?? {};
      const fontSize = (appearance as Record<string, unknown>).fontsize;
      const { fontsize: _, ...rest } = appearance as Record<string, unknown>;
      return {
        ...config,
        appearance: { ...rest, fontSize } as ExampleConfig["appearance"],
      };
    },
  },
];

// --- Loader ---

export const configLoader = new ConfigLoader<
  ExampleConfig,
  ResolvedExampleConfig
>("example-extension", DEFAULT_CONFIG, {
  scopes: ["global", "local"],
  migrations,
  afterMerge: (resolved, _global, local) => {
    // Example: local ignorePaths replace global rather than merge
    if (local?.ignorePaths) {
      resolved.ignorePaths = local.ignorePaths;
    }
    return resolved;
  },
});
