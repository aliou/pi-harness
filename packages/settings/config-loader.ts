/**
 * Generic JSON config loader for pi extensions.
 *
 * Loads config from configurable scopes (global, local, memory),
 * deep-merges with defaults, and optionally applies versioned migrations.
 *
 * Global:  ~/.pi/agent/extensions/{name}.json
 * Local:   {project}/.pi/extensions/{name}.json (walks up to find .pi)
 * Memory:  In-memory only, not persisted, resets on reload
 *
 * Merge priority (lowest to highest): defaults -> global -> local -> memory
 */

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

/**
 * Available configuration scopes.
 * - global: User-wide settings in ~/.pi/agent/extensions/
 * - local: Project-specific settings in {project}/.pi/extensions/
 * - memory: Ephemeral settings, not persisted, reset on reload
 */
export type Scope = "global" | "local" | "memory";

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
  getRawConfig(scope: Scope): TConfig | null;
  hasScope(scope: Scope): boolean;
  hasConfig(scope: Scope): boolean;
  getEnabledScopes(): Scope[];
  save(scope: Scope, config: TConfig): Promise<void>;
}

/**
 * Walk up from cwd to find the project root (.pi directory).
 * Stops at home directory.
 * Returns the path to .pi/extensions/{name}.json, or null if no .pi found.
 */
function findLocalConfigPath(extensionName: string): string | null {
  let dir = process.cwd();
  const home = homedir();

  while (true) {
    const piDir = resolve(dir, ".pi");
    if (existsSync(piDir) && statSync(piDir).isDirectory()) {
      return resolve(piDir, `extensions/${extensionName}.json`);
    }

    // Stop at home directory
    if (dir === home) break;

    const parent = resolve(dir, "..");
    // Stop if we can't go higher
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export class ConfigLoader<TConfig extends object, TResolved extends object>
  implements ConfigStore<TConfig, TResolved>
{
  private globalConfig: TConfig | null = null;
  private localConfig: TConfig | null = null;
  private memoryConfig: TConfig | null = null;
  private resolved: TResolved | null = null;

  private readonly scopes: Scope[];
  private readonly globalPath: string | null;
  private readonly localPath: string | null;
  private readonly defaults: TResolved;
  private readonly migrations: Migration<TConfig>[];
  private readonly afterMerge?: (
    resolved: TResolved,
    global: TConfig | null,
    local: TConfig | null,
    memory: TConfig | null,
  ) => TResolved;

  constructor(
    extensionName: string,
    defaults: TResolved,
    options?: {
      /**
       * Enabled scopes. Default: ["global", "local"]
       * Merge priority (lowest to highest): defaults -> global -> local -> memory
       */
      scopes?: Scope[];
      migrations?: Migration<TConfig>[];
      /**
       * Post-merge hook. Called after deep merge with all raw configs.
       * Use for logic that can't be expressed as a simple merge
       * (e.g., one field replacing another).
       */
      afterMerge?: (
        resolved: TResolved,
        global: TConfig | null,
        local: TConfig | null,
        memory: TConfig | null,
      ) => TResolved;
    },
  ) {
    this.scopes = options?.scopes ?? ["global", "local"];
    this.defaults = defaults;
    this.migrations = options?.migrations ?? [];
    this.afterMerge = options?.afterMerge;

    // Set up paths based on enabled scopes
    this.globalPath = this.scopes.includes("global")
      ? resolve(getAgentDir(), `extensions/${extensionName}.json`)
      : null;

    this.localPath = this.scopes.includes("local")
      ? findLocalConfigPath(extensionName)
      : null;
  }

  /**
   * Load (or reload) config from disk. Applies migrations if needed.
   * Must be called before getConfig() or getRawConfig().
   *
   * Note: Memory config is reset to null on reload (ephemeral).
   */
  async load(): Promise<void> {
    // Load from disk
    this.globalConfig = this.globalPath
      ? await this.readFile(this.globalPath)
      : null;
    this.localConfig = this.localPath
      ? await this.readFile(this.localPath)
      : null;

    // Reset memory on reload (ephemeral)
    this.memoryConfig = null;

    // Apply migrations to disk configs
    if (this.globalConfig && this.globalPath) {
      this.globalConfig = await this.applyMigrations(
        this.globalConfig,
        this.globalPath,
      );
    }
    if (this.localConfig && this.localPath) {
      this.localConfig = await this.applyMigrations(
        this.localConfig,
        this.localPath,
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

  getRawConfig(scope: Scope): TConfig | null {
    switch (scope) {
      case "global":
        return this.globalConfig;
      case "local":
        return this.localConfig;
      case "memory":
        return this.memoryConfig;
    }
  }

  hasScope(scope: Scope): boolean {
    return this.scopes.includes(scope);
  }

  hasConfig(scope: Scope): boolean {
    if (!this.hasScope(scope)) return false;
    return this.getRawConfig(scope) !== null;
  }

  getEnabledScopes(): Scope[] {
    return [...this.scopes];
  }

  /** Save config and reload state (except memory which just updates in place). */
  async save(scope: Scope, config: TConfig): Promise<void> {
    if (!this.hasScope(scope)) {
      throw new Error(`Scope "${scope}" is not enabled`);
    }

    if (scope === "memory") {
      // Memory is ephemeral, just store in place and re-merge
      this.memoryConfig = config;
      this.resolved = this.merge();
      return;
    }

    const path = scope === "global" ? this.globalPath : this.localPath;
    if (!path) {
      throw new Error(`No path configured for scope "${scope}"`);
    }

    await this.writeFile(path, config);

    // Reload disk configs but preserve memory
    const savedMemory = this.memoryConfig;
    this.globalConfig = this.globalPath
      ? await this.readFile(this.globalPath)
      : null;
    this.localConfig = this.localPath
      ? await this.readFile(this.localPath)
      : null;
    this.memoryConfig = savedMemory;
    this.resolved = this.merge();
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
        // Save failed - use migrated version in memory only.
      }
    }

    return current;
  }

  private merge(): TResolved {
    const merged = structuredClone(this.defaults);

    // Merge in priority order: global -> local -> memory
    if (this.globalConfig) this.deepMerge(merged, this.globalConfig);
    if (this.localConfig) this.deepMerge(merged, this.localConfig);
    if (this.memoryConfig) this.deepMerge(merged, this.memoryConfig);

    if (this.afterMerge) {
      return this.afterMerge(
        merged,
        this.globalConfig,
        this.localConfig,
        this.memoryConfig,
      );
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
