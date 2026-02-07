/**
 * Installer. Reads/writes .pi/settings.json for selected skills and packages.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CatalogEntry } from "./catalog";

interface PiSettings {
  skills?: string[];
  packages?: string[];
  [key: string]: unknown;
}

const PI_DIR = ".pi";
const SETTINGS_FILE = "settings.json";

function settingsPath(cwd: string): string {
  return resolve(cwd, PI_DIR, SETTINGS_FILE);
}

/** Read existing .pi/settings.json, or return empty object. */
export async function readSettings(cwd: string): Promise<PiSettings> {
  const path = settingsPath(cwd);
  if (!existsSync(path)) return {};

  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as PiSettings;
  } catch {
    return {};
  }
}

/** Get currently installed skill/package paths from settings. */
export function getInstalled(settings: PiSettings): {
  skills: Set<string>;
  packages: Set<string>;
} {
  return {
    skills: new Set(settings.skills ?? []),
    packages: new Set(settings.packages ?? []),
  };
}

/**
 * Write updated settings based on selected catalog entries.
 * Adds selected entries and removes unselected ones that were previously installed.
 */
export async function applySelections(
  cwd: string,
  selected: CatalogEntry[],
  unselected: CatalogEntry[],
): Promise<void> {
  const piDir = resolve(cwd, PI_DIR);
  if (!existsSync(piDir)) {
    await mkdir(piDir, { recursive: true });
  }

  const settings = await readSettings(cwd);
  const skills = new Set(settings.skills ?? []);
  const packages = new Set(settings.packages ?? []);

  // Add selected
  for (const entry of selected) {
    if (entry.type === "skill") {
      skills.add(entry.path);
    } else {
      packages.add(entry.path);
    }
  }

  // Remove unselected
  for (const entry of unselected) {
    if (entry.type === "skill") {
      skills.delete(entry.path);
    } else {
      packages.delete(entry.path);
    }
  }

  settings.skills = [...skills];
  settings.packages = [...packages];

  // Clean up empty arrays
  if (settings.skills.length === 0) delete settings.skills;
  if (settings.packages.length === 0) delete settings.packages;

  const path = settingsPath(cwd);
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}
