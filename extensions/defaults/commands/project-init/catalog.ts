/**
 * Catalog scanner. Discovers skills and packages from catalog directories.
 *
 * Scans two levels deep:
 * - Level 1: direct children (flat layout) or category dirs
 * - Level 2: children of category dirs (e.g. core/skill-creator/)
 *
 * - Skills: directories containing a SKILL.md file
 * - Packages: directories containing a package.json with a `pi` key
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CatalogSkill {
  type: "skill";
  name: string;
  description: string;
  path: string;
}

export interface CatalogPackage {
  type: "package";
  name: string;
  description: string;
  path: string;
}

export type CatalogEntry = CatalogSkill | CatalogPackage;

/** Extract name and description from SKILL.md frontmatter. */
function parseFrontmatter(
  content: string,
  fallbackName: string,
): { name: string; description: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match?.[1]) return { name: fallbackName, description: "" };

  const fm = match[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? fallbackName;
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";

  return { name, description };
}

/** List immediate subdirectories, skipping hidden dirs and node_modules. */
function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      if (name.startsWith(".") || name === "node_modules") return false;
      return statSync(resolve(dir, name)).isDirectory();
    });
  } catch {
    return [];
  }
}

/** Try to collect a skill or package from a directory. Returns true if found. */
async function tryCollect(
  dirPath: string,
  dirName: string,
  entries: CatalogEntry[],
): Promise<boolean> {
  const skillPath = resolve(dirPath, "SKILL.md");
  if (existsSync(skillPath)) {
    try {
      const content = await readFile(skillPath, "utf-8");
      const { name, description } = parseFrontmatter(content, dirName);
      entries.push({ type: "skill", name, description, path: dirPath });
    } catch {
      entries.push({
        type: "skill",
        name: dirName,
        description: "",
        path: dirPath,
      });
    }
    return true;
  }

  const pkgPath = resolve(dirPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const content = await readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content) as Record<string, unknown>;
      if ("pi" in pkg) {
        entries.push({
          type: "package",
          name: (pkg.name as string) ?? dirName,
          description: (pkg.description as string) ?? "",
          path: dirPath,
        });
        return true;
      }
    } catch {
      // skip malformed package.json
    }
  }

  return false;
}

/** Scan a catalog directory up to maxDepth levels deep. */
async function scanDirectory(
  dir: string,
  maxDepth: number,
): Promise<CatalogEntry[]> {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const entries: CatalogEntry[] = [];
  await scanLevel(dir, entries, 0, maxDepth);
  return entries;
}

async function scanLevel(
  dir: string,
  entries: CatalogEntry[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth >= maxDepth) return;

  for (const child of listDirs(dir)) {
    const childPath = resolve(dir, child);

    const found = await tryCollect(childPath, child, entries);
    if (found) continue;

    await scanLevel(childPath, entries, depth + 1, maxDepth);
  }
}

/** Scan all catalog directories and return deduplicated entries. */
export async function scanCatalog(
  dirs: string[],
  maxDepth: number,
): Promise<CatalogEntry[]> {
  const all: CatalogEntry[] = [];
  const seen = new Set<string>();

  // Expand ~ in paths
  const expandedDirs = dirs.map((d) =>
    d.startsWith("~") ? d.replace("~", process.env.HOME ?? "") : d,
  );

  for (const dir of expandedDirs) {
    const entries = await scanDirectory(dir, maxDepth);
    for (const entry of entries) {
      const key = `${entry.type}:${entry.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(entry);
      }
    }
  }

  return all;
}
