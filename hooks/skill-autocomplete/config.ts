import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { collapseHomePath, expandHomePath } from "@harness/utils/path";
import type { SkillsRoot } from "./skills";

/** A skillsRoots entry. Both fields are required. */
export interface SkillsRootConfig {
  /** Directory containing skill folders. `~` is expanded. */
  path: string;
  /** Short label shown as a `[label]` prefix on every skill from this root. */
  label: string;
}

export interface CompletionConfig {
  /** Root directories containing skill folders, each with a required label. */
  skillsRoots?: SkillsRootConfig[];
  /** Absolute or tilde paths to skill directories loaded regardless of roots. */
  pinned?: unknown;
}

/** Path to the shared completion config file. */
export function getCompletionConfigPath(): string {
  return join(getAgentDir(), "settings", "completion.json");
}

/** Read the completion config. Returns an empty object if the file doesn't exist. */
export function readCompletionConfig(): CompletionConfig {
  const path = getCompletionConfigPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CompletionConfig;
  } catch {
    return {};
  }
}

export interface ResolvedSkillsRoots {
  /** Existing roots, each resolved to an absolute path with a display label. */
  valid: SkillsRoot[];
  /** Configured paths that don't exist on disk (tilde-shortened for display). */
  missing: string[];
}

export interface ResolvedPinnedSkills {
  /** Existing pinned skill directories, absolute. */
  valid: string[];
  /** Configured paths that don't exist on disk (tilde-shortened for display). */
  missing: string[];
}

/**
 * Parse and validate `skillsRoots`. Every entry must be an object with
 * non-empty string `path` and `label`. Throws on any other shape
 * (bare strings, missing fields, non-arrays).
 */
export function parseSkillsRoots(value: unknown): SkillsRootConfig[] {
  if (!Array.isArray(value)) {
    throw new Error("skillsRoots must be an array of { path, label } objects");
  }

  return value.map((entry, index) => {
    const where = `skillsRoots[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where} must be an object with path and label`);
    }

    const { path, label } = entry as Record<string, unknown>;
    if (typeof path !== "string" || path.trim() === "") {
      throw new Error(`${where}.path must be a non-empty string`);
    }
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error(`${where}.label must be a non-empty string`);
    }

    return { path: path.trim(), label: label.trim() };
  });
}

/**
 * Resolve the configured skills roots.
 * Returns valid (existing) roots with labels and missing (non-existing) paths separately.
 * Throws if skillsRoots is present but malformed (see parseSkillsRoots).
 */
export function resolveSkillsRoots(): ResolvedSkillsRoots {
  const config = readCompletionConfig();
  if (!config.skillsRoots) {
    return { valid: [], missing: [] };
  }

  const roots = parseSkillsRoots(config.skillsRoots);

  const valid: SkillsRoot[] = [];
  const missing: string[] = [];

  for (const entry of roots) {
    const absolute = expandHomePath(entry.path);
    if (existsSync(absolute)) {
      valid.push({ path: absolute, label: entry.label });
    } else {
      missing.push(`${entry.label}:${collapseHomePath(absolute)}`);
    }
  }

  return { valid, missing };
}

/**
 * Parse and validate `pinned`. Every entry must be a non-empty string path.
 * Throws on any other shape (non-arrays, non-strings, empty strings).
 */
export function parsePinnedSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("pinned must be an array of skill directory paths");
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new Error(`pinned[${index}] must be a non-empty string path`);
    }
    return entry.trim();
  });
}

/**
 * Resolve the configured `pinned` skill directories.
 * Returns valid absolute paths and missing (non-existing) paths separately.
 * Throws if pinned is present but malformed (see parsePinnedSkills).
 */
export function resolvePinnedSkills(): ResolvedPinnedSkills {
  const config = readCompletionConfig();
  if (config.pinned === undefined) {
    return { valid: [], missing: [] };
  }

  const pinned = parsePinnedSkills(config.pinned);

  const valid: string[] = [];
  const missing: string[] = [];

  for (const entry of pinned) {
    const absolute = expandHomePath(entry);
    if (existsSync(absolute)) {
      valid.push(absolute);
    } else {
      missing.push(collapseHomePath(absolute));
    }
  }

  return { valid, missing };
}
