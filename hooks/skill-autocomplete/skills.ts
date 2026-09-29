import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseSkillDescription } from "@harness/utils";
import { collapseHomePath } from "@harness/utils/path";

/** A configured skill root, resolved to an absolute path with a display label. */
export interface SkillsRoot {
  /** Absolute path to the root directory containing skill folders. */
  path: string;
  /** Short label identifying this root, shown as a `[label]` prefix. */
  label: string;
}

export interface SkillInfo {
  /** Directory name, e.g. "vitest". */
  name: string;
  /** Description from the SKILL.md frontmatter. */
  description?: string;
  /** Absolute path to SKILL.md, e.g. "/home/user/skills/vitest/SKILL.md". */
  fullPath: string;
  /** Absolute skill directory used to resolve relative references. */
  baseDir: string;
  /** Tilde path to directory, e.g. "~/skills/vitest". */
  directory: string;
  /** Label of the root this skill was loaded from. */
  sourceLabel: string;
}

/**
 * Read the `pi.skills` manifest from a package.json.
 * Returns the declared skill paths (resolved against `packageRoot`) or `null`
 * when the file is missing or has no `pi.skills` array.
 *
 * Mirrors pi's internal `readPiManifest` (not exported). pi's package manager
 * uses this same field to enumerate skills in an installed package.
 */
function readPiSkills(packageJsonPath: string): string[] | null {
  if (!existsSync(packageJsonPath)) return null;
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return null;
  }
  const pi = (pkg as { pi?: unknown } | null)?.pi;
  const skills = (pi as { skills?: unknown } | null)?.skills;
  if (!Array.isArray(skills) || !skills.every((e) => typeof e === "string")) {
    return null;
  }
  return skills;
}

/**
 * Load a single skill from a directory that directly contains `SKILL.md`.
 * Returns `null` when the dir is not a skill directory.
 */
function loadSkillFromDir(dir: string, sourceLabel: string): SkillInfo | null {
  const fullPath = join(dir, "SKILL.md");
  if (!existsSync(fullPath)) return null;
  const description = parseSkillDescription(readFileSync(fullPath, "utf-8"));
  return {
    name: basename(dir),
    description: description ?? undefined,
    fullPath,
    baseDir: dir,
    directory: collapseHomePath(dir),
    sourceLabel,
  };
}

/**
 * Register a skill, honoring first-root-wins dedup by skill name.
 */
function addSkill(
  skills: SkillInfo[],
  seen: Set<string>,
  skill: SkillInfo,
): void {
  if (seen.has(skill.name)) return;
  seen.add(skill.name);
  skills.push(skill);
}

/**
 * Load skills for explicitly pinned skill directories.
 *
 * Each path must be a skill directory (containing `SKILL.md`); other paths
 * are silently skipped. Pinned skills are loaded regardless of the configured
 * roots and claim their name before any root is scanned.
 */
export function loadPinnedSkills(
  paths: string[],
  sourceLabel: string,
): SkillInfo[] {
  const skills: SkillInfo[] = [];
  for (const path of paths) {
    const skill = loadSkillFromDir(path, sourceLabel);
    if (skill) skills.push(skill);
  }
  return skills;
}

/**
 * List skills under the given roots, with pinned skills loaded first.
 *
 * For each root, scan immediate subdirectories:
 * - an immediate subdir that directly contains `SKILL.md` is registered as a
 *   skill (current behavior);
 * - otherwise, if that subdir has a `package.json` declaring `pi.skills`,
 *   each declared path is resolved against the subdir and loaded. This surfaces
 *   nested wrapper packages (e.g. `obsidian/json-canvas`) without recursion.
 *
 * No descent beyond one level. Hidden directories and `node_modules` are
 * skipped. Pinned skills win name collisions against roots; the first root
 * to claim a given skill name wins over later duplicates.
 */
export function listSkills(
  skillsRoots: SkillsRoot[],
  pinned: SkillInfo[] = [],
): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seenNames = new Set<string>();

  for (const skill of pinned) {
    addSkill(skills, seenNames, skill);
  }

  for (const root of skillsRoots) {
    let names: string[];
    try {
      names = readdirSync(root.path);
    } catch (_error) {
      void _error;
      continue;
    }

    for (const name of names) {
      if (name.startsWith(".") || name === "node_modules") continue;

      const dir = join(root.path, name);
      let isDirectory: boolean;
      try {
        isDirectory = statSync(dir).isDirectory();
      } catch (_error) {
        void _error;
        continue;
      }
      if (!isDirectory) continue;

      const direct = loadSkillFromDir(dir, root.label);
      if (direct) {
        addSkill(skills, seenNames, direct);
        continue;
      }

      const manifest = readPiSkills(join(dir, "package.json"));
      if (!manifest) continue;
      for (const rel of manifest) {
        const skillPath = resolve(dir, rel);
        try {
          if (!statSync(skillPath).isFile()) continue;
        } catch (_error) {
          void _error;
          continue;
        }
        const skill = loadSkillFromDir(dirname(skillPath), root.label);
        if (skill) addSkill(skills, seenNames, skill);
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
