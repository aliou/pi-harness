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
  } catch {
    return false;
  }
}

export function discoverNvim(cwd: string): DiscoverResult {
  const dataDirs = getPiNvimDataDirs();
  const hash = cwdHash(cwd);
  const prefix = `${hash}-`;

  const instances: DiscoveredInstance[] = [];

  // Check all possible data directories
  for (const dataDir of dataDirs) {
    if (!fs.existsSync(dataDir)) {
      continue;
    }

    const candidates = fs
      .readdirSync(dataDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((f) => path.join(dataDir, f));

    // Filter stale lockfiles
    for (const lockfilePath of candidates) {
      try {
        const raw = fs.readFileSync(lockfilePath, "utf8");
        const lockfile = JSON.parse(raw) as Lockfile;

        if (!lockfile.pid || !isProcessRunning(lockfile.pid)) {
          fs.unlinkSync(lockfilePath);
          continue;
        }

        instances.push({ lockfilePath, lockfile });
      } catch {
        // Corrupt lockfile, remove
        try {
          fs.unlinkSync(lockfilePath);
        } catch {
          // ignore
        }
      }
    }
  }

  return instances;
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
