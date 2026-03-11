/**
 * Update logic for pinned packages.
 * Ported from ~/.pi/agent/bin/update
 *
 * All child process calls are async to avoid blocking the event loop.
 */

import { execFile as execFileCb } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface PackageUpdate {
  id: string;
  source: string;
  type: "npm" | "git";
  fromVersion: string;
  toVersion: string;
  fromRef: string;
  toRef: string;
}

export interface CheckResult {
  updates: PackageUpdate[];
  skipped: string[];
  errors: string[];
}

export interface ApplyResult {
  success: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseNpmPinned(
  source: string,
): { name: string; version: string } | null {
  if (!source.startsWith("npm:")) return null;
  const spec = source.slice(4);
  const at = spec.lastIndexOf("@");
  if (at <= 0) return null;
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!name || !version) return null;
  return { name, version };
}

function parseGitPinned(
  source: string,
): { delimiter: string; base: string; ref: string } | null {
  const hashIndex = source.lastIndexOf("#");
  if (hashIndex > -1) {
    const base = source.slice(0, hashIndex);
    const ref = source.slice(hashIndex + 1);
    if (base && ref) return { delimiter: "#", base, ref };
  }

  const atIndex = source.lastIndexOf("@");
  const slashIndex = source.lastIndexOf("/");
  if (atIndex > slashIndex && atIndex > -1) {
    const base = source.slice(0, atIndex);
    const ref = source.slice(atIndex + 1);
    if (base && ref) return { delimiter: "@", base, ref };
  }

  return null;
}

function parseGitHostPath(
  sourceWithoutRef: string,
): { host: string; repoPath: string } | null {
  let s = sourceWithoutRef;
  if (s.startsWith("git:")) s = s.slice(4);

  const scpMatch = s.match(/^git@([^:]+):(.+)$/);
  if (scpMatch?.[1] !== undefined) {
    return {
      host: scpMatch[1],
      repoPath: (scpMatch[2] ?? "").replace(/\.git$/, ""),
    };
  }

  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("ssh://") ||
    s.startsWith("git://")
  ) {
    try {
      const u = new URL(s);
      return {
        host: u.hostname,
        repoPath: u.pathname.replace(/^\/+/, "").replace(/\.git$/, ""),
      };
    } catch {
      return null;
    }
  }

  const slashIndex = s.indexOf("/");
  if (slashIndex > 0) {
    return {
      host: s.slice(0, slashIndex),
      repoPath: s.slice(slashIndex + 1).replace(/\.git$/, ""),
    };
  }

  return null;
}

function normalizeGitRemote(sourceWithoutRef: string): string {
  let s = sourceWithoutRef;
  if (s.startsWith("git:")) s = s.slice(4);
  if (s.startsWith("github.com/")) return `https://${s}`;
  return s;
}

function isGitLikeSource(source: string): boolean {
  return (
    source.startsWith("git:") ||
    source.startsWith("https://") ||
    source.startsWith("http://") ||
    source.startsWith("ssh://") ||
    source.startsWith("git://")
  );
}

// ---------------------------------------------------------------------------
// Async child-process helpers
// ---------------------------------------------------------------------------

async function npmLatestVersion(pkgName: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("npm", ["view", pkgName, "version"]);
    const v = stdout.trim();
    return v || null;
  } catch {
    return null;
  }
}

async function gitHeadSha(remote: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["ls-remote", remote, "HEAD"]);
    const parts = stdout.trim().split(/\s+/);
    const sha = parts[0];
    if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) return null;
    return sha;
  } catch {
    return null;
  }
}

async function run(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<void> {
  await execFile(command, args, {
    encoding: "utf8",
    cwd: options?.cwd,
  });
}

// ---------------------------------------------------------------------------
// Check for updates (async)
// ---------------------------------------------------------------------------

async function checkNpmUpdate(source: string): Promise<PackageUpdate | null> {
  const parsed = parseNpmPinned(source);
  if (!parsed) return null;

  const latest = await npmLatestVersion(parsed.name);
  if (!latest || latest === parsed.version) return null;

  return {
    id: `npm:${parsed.name}`,
    source,
    type: "npm",
    fromVersion: parsed.version,
    toVersion: latest,
    fromRef: parsed.version,
    toRef: latest,
  };
}

async function checkGitUpdate(source: string): Promise<PackageUpdate | null> {
  if (!isGitLikeSource(source)) return null;

  const pinned = parseGitPinned(source);
  if (!pinned) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(pinned.ref)) return null;

  const remote = normalizeGitRemote(pinned.base);
  const head = await gitHeadSha(remote);
  if (!head) return null;

  const nextRef = head.slice(0, pinned.ref.length);
  if (nextRef === pinned.ref) return null;

  const hp = parseGitHostPath(pinned.base);
  const id = hp ? `git:${hp.host}/${hp.repoPath}` : `git:${pinned.base}`;

  return {
    id,
    source,
    type: "git",
    fromVersion: pinned.ref.slice(0, 7),
    toVersion: nextRef.slice(0, 7),
    fromRef: pinned.ref,
    toRef: nextRef,
  };
}

function classifySkipped(source: string): string {
  if (parseNpmPinned(source)) return `${source} (already latest)`;
  if (!isGitLikeSource(source)) return `${source} (unknown source type)`;

  const pinned = parseGitPinned(source);
  if (!pinned) return `${source} (unpinned)`;
  if (!/^[0-9a-f]{7,40}$/i.test(pinned.ref)) {
    return `${source} (non-commit ref, skipped)`;
  }
  return `${source} (already latest HEAD)`;
}

export async function checkForUpdates(
  settingsPath?: string,
): Promise<CheckResult> {
  const resolved =
    settingsPath ?? join(homedir(), ".pi", "agent", "settings.json");

  if (!existsSync(resolved)) {
    return { updates: [], skipped: [], errors: [`Not found: ${resolved}`] };
  }

  let data: { packages?: unknown[] };
  try {
    const raw = readFileSync(resolved, "utf8");
    data = JSON.parse(raw) as { packages?: unknown[] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      updates: [],
      skipped: [],
      errors: [`Failed to read settings: ${msg}`],
    };
  }

  if (!Array.isArray(data.packages)) {
    return {
      updates: [],
      skipped: [],
      errors: [`No packages array in ${resolved}`],
    };
  }

  const updates: PackageUpdate[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Check all packages concurrently for speed.
  const sources: string[] = [];
  for (const entry of data.packages) {
    const source =
      typeof entry === "string" ? entry : (entry as { source?: string }).source;
    if (source && typeof source === "string") sources.push(source);
  }

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const npmUpdate = await checkNpmUpdate(source);
      if (npmUpdate) return { source, update: npmUpdate };

      const gitUpdate = await checkGitUpdate(source);
      if (gitUpdate) return { source, update: gitUpdate };

      return { source, update: null };
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(String(result.reason));
      continue;
    }
    const { source, update } = result.value;
    if (update) {
      updates.push(update);
    } else {
      skipped.push(classifySkipped(source));
    }
  }

  return { updates, skipped, errors };
}

// ---------------------------------------------------------------------------
// Apply updates (async, preserves full settings)
// ---------------------------------------------------------------------------

function getInstallRoots(settingsPath: string): {
  scope: "user" | "project";
  gitRoot: string;
  npmRoot: string | null;
} {
  const resolvedPath = resolve(settingsPath);
  const homeGlobal = resolve(join(homedir(), ".pi", "agent", "settings.json"));
  const scope = resolvedPath === homeGlobal ? "user" : "project";

  if (scope === "user") {
    const base = join(homedir(), ".pi", "agent");
    return { scope, gitRoot: join(base, "git"), npmRoot: null };
  }

  const base = resolvedPath.replace(/[/\\](?:settings|extensions)\.json$/, "");
  return { scope, gitRoot: join(base, "git"), npmRoot: join(base, "npm") };
}

function ensureProjectNpmRoot(npmRoot: string): void {
  if (!existsSync(npmRoot)) {
    mkdirSync(npmRoot, { recursive: true });
    const pkgPath = join(npmRoot, "package.json");
    writeFileSync(
      pkgPath,
      `${JSON.stringify({ name: "pi-harness", private: true }, null, 2)}\n`,
      "utf8",
    );
  }
}

async function refreshGitInstall(
  source: string,
  settingsPath: string,
): Promise<string> {
  const pinned = parseGitPinned(source);
  if (!pinned) return "git source unpinned; skipped";

  const hp = parseGitHostPath(pinned.base);
  if (!hp?.host || !hp.repoPath) return "cannot parse git host/path; skipped";

  const { gitRoot } = getInstallRoots(settingsPath);
  const targetDir = join(gitRoot, hp.host, hp.repoPath);
  const remote = normalizeGitRemote(pinned.base);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    await run("git", ["clone", remote, targetDir]);
  } else {
    await run("git", ["fetch", "--prune", "origin"], { cwd: targetDir });
  }

  await run("git", ["checkout", pinned.ref], { cwd: targetDir });

  if (existsSync(join(targetDir, "package.json"))) {
    await run("npm", ["install"], { cwd: targetDir });
  }

  return `refreshed ${targetDir}`;
}

async function refreshNpmInstall(
  source: string,
  settingsPath: string,
): Promise<string> {
  const parsed = parseNpmPinned(source);
  if (!parsed) return "npm source unpinned; skipped";

  const { scope, npmRoot } = getInstallRoots(settingsPath);
  if (scope === "user") {
    await run("npm", ["install", "-g", `${parsed.name}@${parsed.version}`]);
    return `installed ${parsed.name}@${parsed.version} globally`;
  }

  if (!npmRoot) return "npm root not configured";
  ensureProjectNpmRoot(npmRoot);
  await run("npm", [
    "install",
    `${parsed.name}@${parsed.version}`,
    "--prefix",
    npmRoot,
  ]);
  return `installed ${parsed.name}@${parsed.version} in ${npmRoot}`;
}

/**
 * Build the new source string for an update by reconstructing from parsed
 * components (not string replace, which is fragile).
 */
function buildNewSource(update: PackageUpdate): string | null {
  if (update.type === "npm") {
    const parsed = parseNpmPinned(update.source);
    if (!parsed) return null;
    return `npm:${parsed.name}@${update.toVersion}`;
  }

  const pinned = parseGitPinned(update.source);
  if (!pinned) return null;
  return `${pinned.base}${pinned.delimiter}${update.toRef}`;
}

export async function applyUpdates(
  updates: PackageUpdate[],
  settingsPath?: string,
): Promise<ApplyResult> {
  const resolved =
    settingsPath ?? join(homedir(), ".pi", "agent", "settings.json");

  if (!existsSync(resolved)) {
    return { success: [], errors: [`Not found: ${resolved}`] };
  }

  let data: Record<string, unknown>;
  try {
    const raw = readFileSync(resolved, "utf8");
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: [], errors: [`Failed to read settings: ${msg}`] };
  }

  if (!Array.isArray(data.packages)) {
    return { success: [], errors: [`No packages array in ${resolved}`] };
  }

  // Build a lookup by original source string.
  const updateBySource = new Map<string, PackageUpdate>();
  for (const u of updates) updateBySource.set(u.source, u);

  // Update only the packages array, preserve everything else.
  const newPackages = (data.packages as unknown[]).map((entry) => {
    const source =
      typeof entry === "string" ? entry : (entry as { source?: string }).source;
    if (!source || typeof source !== "string") return entry;

    const update = updateBySource.get(source);
    if (!update) return entry;

    const newSource = buildNewSource(update);
    if (!newSource) return entry;

    if (typeof entry === "string") return newSource;
    if (typeof entry === "object" && entry !== null) {
      return { ...entry, source: newSource };
    }
    return entry;
  });

  // Write back the full settings with only packages changed.
  const newData = { ...data, packages: newPackages };
  const tmp = `${resolved}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(newData, null, 2)}\n`, "utf8");
  renameSync(tmp, resolved);

  // Refresh local installs.
  const success: string[] = [];
  const errors: string[] = [];

  for (const update of updates) {
    const newSource = buildNewSource(update);
    if (!newSource) {
      errors.push(`${update.id}: failed to build new source`);
      continue;
    }

    try {
      const detail =
        update.type === "git"
          ? await refreshGitInstall(newSource, resolved)
          : await refreshNpmInstall(newSource, resolved);
      success.push(`${update.id}: ${detail}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${update.id}: ${msg}`);
    }
  }

  return { success, errors };
}
