#!/usr/bin/env nix-shell
/*
#!nix-shell -i node -p nodejs-slim
*/

/**
 * List skills from every configured skill library.
 *
 * Reads the same completion config the `?` skill autocomplete uses
 * ($PI_CODING_AGENT_DIR/settings/completion.json, default ~/.pi/agent),
 * validates each library entry, and prints every skill grouped by library
 * with its description and the absolute path to its SKILL.md. Skills pinned
 * via the `pinned` config are listed under a [pin] block and shadow
 * same-named skills from the roots, matching the runtime resolution.
 *
 * Self-contained: no dependencies, no build step. Run with `node`.
 *
 * Exits non-zero with a message on stderr if the config is missing, unreadable,
 * or if a library entry is not an object with non-empty `path` and `label`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the agent dir: $PI_CODING_AGENT_DIR, else ~/.pi/agent. */
function getAgentDir() {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function getConfigPath() {
  return join(getAgentDir(), "settings", "completion.json");
}

/** Expand a leading ~ to the home directory. */
function expandHome(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** Collapse the home directory to ~ for display. */
function collapseHome(p) {
  const home = homedir();
  return p.startsWith(home) ? join("~", p.slice(home.length)) : p;
}

/**
 * Parse and validate skillsRoots. Both `path` and `label` are required
 * non-empty strings; any other shape throws.
 */
function parseSkillsRoots(value) {
  if (!Array.isArray(value)) {
    throw new Error("skillsRoots must be an array of { path, label } objects");
  }

  return value.map((entry, index) => {
    const where = `skillsRoots[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where} must be an object with path and label`);
    }

    const { path, label } = entry;
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
 * Parse and validate `pinned`. Every entry must be a non-empty string path;
 * any other shape throws.
 */
function parsePinned(value) {
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

/** YAML block-scalar indicators: the value spans the following indented lines. */
const BLOCK_SCALAR_INDICATORS = new Set(["|", "|-", "|+", ">", ">-", ">+"]);

/**
 * Extract `name` and `description` from a SKILL.md YAML frontmatter block.
 * Handles plain, quoted, and block-scalar (`|`/`>`) values; block scalars are
 * joined into a single line.
 */
function parseSkillFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const out = {};
  let key = null;
  let inBlock = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (inBlock && /^\s+/.test(line)) {
      const text = line.trim();
      out[key] = out[key] ? `${out[key]} ${text}` : text;
      continue;
    }
    inBlock = false;

    const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]*):\s*(.*)$/);
    if (!m) continue;
    key = m[1];
    let value = m[2].trim();

    if (BLOCK_SCALAR_INDICATORS.has(value)) {
      out[key] = "";
      inBlock = true;
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

/** List skills (immediate subdirectories with a SKILL.md) under a root. */
function listSkills(rootPath) {
  const skills = [];
  let entries;
  try {
    entries = readdirSync(rootPath);
  } catch {
    return skills;
  }

  for (const name of entries.sort((a, b) => a.localeCompare(b))) {
    const dir = join(rootPath, name);
    const skillFile = join(dir, "SKILL.md");
    try {
      if (!statSync(dir).isDirectory() || !existsSync(skillFile)) continue;
    } catch {
      continue;
    }
    const fm = parseSkillFrontmatter(readFileSync(skillFile, "utf-8"));
    const description =
      typeof fm.description === "string"
        ? fm.description.replace(/\s+/g, " ").trim()
        : "";
    skills.push({
      name: typeof fm.name === "string" && fm.name ? fm.name : name,
      description,
      path: skillFile,
    });
  }

  return skills;
}

function main() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    process.stderr.write(`No completion config at ${configPath}\n`);
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    process.stderr.write(
      `Failed to parse ${configPath}: ${error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!config.skillsRoots) {
    process.stdout.write("No skill libraries configured.\n");
    return;
  }

  let roots;
  try {
    roots = parseSkillsRoots(config.skillsRoots);
  } catch (error) {
    process.stderr.write(
      `Invalid skillsRoots in ${configPath}: ${error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const blocks = [];
  const claimed = new Set();

  // Pinned skills load first and shadow same-named skills from the roots,
  // matching hooks/skill-autocomplete. Paths that are not skill directories
  // (no SKILL.md or missing) are silently skipped, as loadPinnedSkills does.
  if (config.pinned !== undefined) {
    let pinnedPaths;
    try {
      pinnedPaths = parsePinned(config.pinned);
    } catch (error) {
      process.stderr.write(
        `Pinned skills disabled — invalid config in ${configPath}: ${error.message}\n`,
      );
      pinnedPaths = [];
    }

    const lines = ["[pin]"];
    let found = 0;
    for (const p of pinnedPaths) {
      const absolute = expandHome(p);
      const skillFile = join(absolute, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const fm = parseSkillFrontmatter(readFileSync(skillFile, "utf-8"));
      const description =
        typeof fm.description === "string"
          ? fm.description.replace(/\s+/g, " ").trim()
          : "";
      const name =
        typeof fm.name === "string" && fm.name ? fm.name : absolute.split("/").pop();
      claimed.add(name);
      const suffix = description ? ` — ${description}` : "";
      lines.push(`  ${name}${suffix}`);
      lines.push(`    ${skillFile}`);
      found++;
    }
    if (found > 0) blocks.push(lines.join("\n"));
  }

  for (const root of roots) {
    const absolute = expandHome(root.path);
    const header = `[${root.label}] ${collapseHome(absolute)}`;
    const lines = [header];

    if (!existsSync(absolute)) {
      lines.push("  (missing — directory does not exist)");
      blocks.push(lines.join("\n"));
      continue;
    }

    const skills = listSkills(absolute).filter((skill) => !claimed.has(skill.name));
    if (skills.length === 0) {
      lines.push("  (no skills)");
      blocks.push(lines.join("\n"));
      continue;
    }

    for (const skill of skills) {
      const description = skill.description ? ` — ${skill.description}` : "";
      lines.push(`  ${skill.name}${description}`);
      lines.push(`    ${skill.path}`);
      claimed.add(skill.name);
    }
    blocks.push(lines.join("\n"));
  }

  process.stdout.write(`${blocks.join("\n\n")}\n`);
}

main();
