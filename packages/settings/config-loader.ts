/**
 * Generic JSON config loader for pi extensions.
 *
 * Loads config from two files (global + project), deep-merges with defaults,
 * and optionally applies versioned migrations.
 *
 * Global:  ~/.pi/agent/extensions/{name}.json
 * Project: .pi/extensions/{name}.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

/**
 * A migration that transforms a config from one version to another.
 * Migrations are applied in order during load(). If any migration
 * returns a modified config, the result is saved back to disk.
 */
export interface Migration<TConfig> {
  /** Name for logging on failure. */
  name: string;
  /** Return true if this migration should run on the given config. */
  shouldRun: (config: TConfig) => boolean;
  /**
   * Transform the config. Receives the file path for backup/logging.
   * Return the migrated config.
   */
  run: (config: TConfig, filePath: string) => Promise<TConfig> | TConfig;
}

/**
 * Interface for settings storage, used by registerSettingsCommand.
 * ConfigLoader implements this. Extensions with custom loaders can
 * implement this interface directly.
 */
export interface ConfigStore<TConfig extends object, TResolved extends object> {
  getConfig(): TResolved;
  getRawConfig(scope: "global" | "project"): TConfig | null;
  hasConfig(scope: "global" | "project"): boolean;
  save(scope: "global" | "project", config: TConfig): Promise<void>;
}

export class ConfigLoader<TConfig extends object, TResolved extends object>
  implements ConfigStore<TConfig, TResolved>
{
  private globalConfig: TConfig | null = null;
  private projectConfig: TConfig | null = null;
  private resolved: TResolved | null = null;

  private readonly globalPath: string;
  private readonly projectPath: string;
  private readonly defaults: TResolved;
  private readonly migrations: Migration<TConfig>[];
  private readonly afterMerge?: (
    resolved: TResolved,
    global: TConfig | null,
    project: TConfig | null,
  ) => TResolved;

  constructor(
    extensionName: string,
    defaults: TResolved,
    options?: {
      migrations?: Migration<TConfig>[];
      /**
       * Post-merge hook. Called after deep merge with both raw configs.
       * Use for logic that can't be expressed as a simple merge
       * (e.g., one field replacing another).
       */
      afterMerge?: (
        resolved: TResolved,
        global: TConfig | null,
        project: TConfig | null,
      ) => TResolved;
    },
  ) {
    this.globalPath = resolve(
      getAgentDir(),
      `extensions/${extensionName}.json`,
    );
    this.projectPath = resolve(
      process.cwd(),
      `.pi/extensions/${extensionName}.json`,
    );
    this.defaults = defaults;
    this.migrations = options?.migrations ?? [];
    this.afterMerge = options?.afterMerge;
  }

  /**
   * Load (or reload) config from disk. Applies migrations if needed.
   * Must be called before getConfig() or getRawConfig().
   */
  async load(): Promise<void> {
    this.globalConfig = await this.readFile(this.globalPath);
    this.projectConfig = await this.readFile(this.projectPath);

    if (this.globalConfig) {
      this.globalConfig = await this.applyMigrations(
        this.globalConfig,
        this.globalPath,
      );
    }
    if (this.projectConfig) {
      this.projectConfig = await this.applyMigrations(
        this.projectConfig,
        this.projectPath,
      );
    }

    this.resolved = this.merge();
  }

  getConfig(): TResolved {
    if (!this.resolved) {
      throw new Error("Config not loaded. Call load() first.");
    }
    return this.resolved;
  }

  getRawConfig(scope: "global" | "project"): TConfig | null {
    return scope === "global" ? this.globalConfig : this.projectConfig;
  }

  hasConfig(scope: "global" | "project"): boolean {
    return scope === "global"
      ? this.globalConfig !== null
      : this.projectConfig !== null;
  }

  /** Save config and reload all state. */
  async save(scope: "global" | "project", config: TConfig): Promise<void> {
    const path = scope === "global" ? this.globalPath : this.projectPath;
    await this.writeFile(path, config);
    await this.load();
  }

  // --- Internal ---

  private async applyMigrations(
    config: TConfig,
    filePath: string,
  ): Promise<TConfig> {
    let current = config;
    let changed = false;

    for (const migration of this.migrations) {
      if (!migration.shouldRun(current)) continue;
      try {
        current = await migration.run(current, filePath);
        changed = true;
      } catch (error) {
        console.error(
          `[settings] Migration "${migration.name}" failed for ${filePath}: ${error}`,
        );
      }
    }

    if (changed) {
      try {
        await this.writeFile(filePath, current);
      } catch {
        // Save failed — use migrated version in memory only.
      }
    }

    return current;
  }

  private merge(): TResolved {
    const merged = structuredClone(this.defaults);
    if (this.globalConfig) this.deepMerge(merged, this.globalConfig);
    if (this.projectConfig) this.deepMerge(merged, this.projectConfig);
    if (this.afterMerge) {
      return this.afterMerge(merged, this.globalConfig, this.projectConfig);
    }
    return merged;
  }

  private deepMerge(target: object, source: object): void {
    const t = target as Record<string, unknown>;
    const s = source as Record<string, unknown>;
    for (const key in s) {
      if (s[key] === undefined) continue;
      if (
        typeof s[key] === "object" &&
        !Array.isArray(s[key]) &&
        s[key] !== null
      ) {
        if (!t[key] || typeof t[key] !== "object") t[key] = {};
        this.deepMerge(t[key] as object, s[key] as object);
      } else {
        t[key] = s[key];
      }
    }
  }

  private async readFile(path: string): Promise<TConfig | null> {
    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as TConfig;
    } catch {
      return null;
    }
  }

  private async writeFile(path: string, config: TConfig): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }
}
