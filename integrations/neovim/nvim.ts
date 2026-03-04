import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Lockfile {
  socket: string;
  cwd: string;
  pid: number;
}

export interface DiscoveredInstance {
  lockfilePath: string;
  lockfile: Lockfile;
}

export type DiscoverResult = DiscoveredInstance[];

export interface ExecOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed?: boolean;
}

export type ExecFn = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

const LOCKFILE_NAME_PATTERN = /^[0-9a-f]{8}-\d+\.json$/;

function getNvimAppName(): string {
  return process.env.NVIM_APPNAME && process.env.NVIM_APPNAME.length > 0
    ? process.env.NVIM_APPNAME
    : "nvim";
}

function getDataHome(): string {
  if (process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.length > 0) {
    return process.env.XDG_DATA_HOME;
  }

  // Default to XDG paths on all platforms to match Neovim's stdpath('data') behavior
  // Neovim uses XDG paths by default, even on macOS
  return path.join(os.homedir(), ".local", "share");
}

/**
 * Get possible data directories where Neovim might store lockfiles.
 * Neovim's stdpath('data') behavior varies by platform and build configuration.
 */
export function getPiNvimDataDirs(): string[] {
  const appName = getNvimAppName();
  const dirs: string[] = [];

  // Primary: XDG or configured data home
  dirs.push(path.join(getDataHome(), appName, "pi-nvim"));

  // Fallback for macOS: some Neovim builds use native macOS paths
  if (process.platform === "darwin" && !process.env.XDG_DATA_HOME) {
    dirs.push(
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        appName,
        "pi-nvim",
      ),
    );
  }

  return dirs;
}

export function getPiNvimDataDir(): string {
  const dirs = getPiNvimDataDirs();
  const firstDir = dirs[0];
  if (!firstDir) {
    throw new Error("No Pi nvim data directory found");
  }
  return firstDir;
}

export function cwdHash(cwd: string): string {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 8);
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      // Process exists but we do not have permission to signal it
      return true;
    }
    return false;
  }
}

function normalizePathForComparison(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Check if Neovim's CWD is inside Pi's CWD (child directory)
 *
 * Called as isRelatedCwd(piCwd, nvimCwd). Only matches when Neovim is
 * in a subdirectory of Pi's working directory, not the reverse
 */
function isRelatedCwd(piCwd: string, nvimCwd: string): boolean {
  const pi = normalizePathForComparison(piCwd) + path.sep;
  const nvim = normalizePathForComparison(nvimCwd) + path.sep;
  return nvim.startsWith(pi);
}

function relatedPathDepth(piCwd: string, nvimCwd: string): number {
  const pi = normalizePathForComparison(piCwd);
  const nvim = normalizePathForComparison(nvimCwd);
  const relative = path.relative(pi, nvim);

  if (relative.length === 0) {
    return 0;
  }

  return relative.split(path.sep).filter((segment) => segment.length > 0)
    .length;
}

function isLockfileName(fileName: string): boolean {
  return LOCKFILE_NAME_PATTERN.test(fileName);
}

function isValidLockfile(value: unknown): value is Lockfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<Lockfile>;
  return (
    typeof maybe.socket === "string" &&
    maybe.socket.length > 0 &&
    typeof maybe.cwd === "string" &&
    maybe.cwd.length > 0 &&
    typeof maybe.pid === "number" &&
    Number.isInteger(maybe.pid) &&
    maybe.pid > 0
  );
}

function removeLockfileSilently(lockfilePath: string): void {
  try {
    fs.unlinkSync(lockfilePath);
  } catch {
    // ignore
  }
}

/**
 * Read and validate a single lockfile, removing it if stale or corrupt
 */
function readLockfile(
  lockfilePath: string,
  fileName: string,
): DiscoveredInstance | null {
  if (!isLockfileName(fileName)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(lockfilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isValidLockfile(parsed)) {
      removeLockfileSilently(lockfilePath);
      return null;
    }

    if (!isProcessRunning(parsed.pid)) {
      removeLockfileSilently(lockfilePath);
      return null;
    }

    return { lockfilePath, lockfile: parsed };
  } catch {
    removeLockfileSilently(lockfilePath);
    return null;
  }
}

export function discoverNvim(cwd: string): DiscoverResult {
  const dataDirs = getPiNvimDataDirs();
  const hash = cwdHash(cwd);
  const prefix = `${hash}-`;

  const exactMatches: DiscoveredInstance[] = [];
  const relatedMatches: DiscoveredInstance[] = [];

  for (const dataDir of dataDirs) {
    if (!fs.existsSync(dataDir)) {
      continue;
    }

    const lockfileNames = fs.readdirSync(dataDir).filter(isLockfileName);

    for (const fileName of lockfileNames) {
      const lockfilePath = path.join(dataDir, fileName);
      const instance = readLockfile(lockfilePath, fileName);
      if (!instance) continue;

      if (fileName.startsWith(prefix)) {
        exactMatches.push(instance);
      } else if (isRelatedCwd(cwd, instance.lockfile.cwd)) {
        relatedMatches.push(instance);
      }
    }
  }

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // Prefer nearest related directories to reduce noisy selection prompts
  return relatedMatches.sort((a, b) => {
    const depthDelta =
      relatedPathDepth(cwd, a.lockfile.cwd) -
      relatedPathDepth(cwd, b.lockfile.cwd);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    return a.lockfile.cwd.localeCompare(b.lockfile.cwd);
  });
}

export type NvimAction = string | { type: string; [key: string]: unknown };

// TODO: Strongly type the return value based on action.
export async function queryNvim(
  exec: ExecFn,
  socket: string,
  action: NvimAction,
  options?: ExecOptions,
): Promise<unknown> {
  // Use the running Neovim instance as an RPC server and ask it to evaluate a
  // pure expression, returning JSON.
  // For string actions: require("pi-nvim").query("action")
  // For table actions: require("pi-nvim").query({ type = "action", ... })
  let expr: string;
  if (typeof action === "string") {
    expr = `luaeval('vim.json.encode(require("pi-nvim").query("${action}"))')`;
  } else {
    const actionJson = JSON.stringify(action);
    // Escape single quotes for Lua string
    const escaped = actionJson.replace(/'/g, "\\'");
    expr = `luaeval('vim.json.encode(require("pi-nvim").query(vim.json.decode([==[${escaped}]==])))')`;
  }

  const result = await exec(
    "nvim",
    ["--server", socket, "--remote-expr", expr],
    {
      timeout: 5000,
      ...options,
    },
  );

  if (result.killed) {
    throw new Error("Timed out querying Neovim");
  }

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Neovim query failed");
  }

  const out = result.stdout.trim();
  if (out.length === 0) {
    return null;
  }

  try {
    return JSON.parse(out);
  } catch {
    // If Neovim returned a string (or non-JSON), surface it.
    return out;
  }
}
