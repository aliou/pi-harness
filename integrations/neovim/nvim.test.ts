import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cwdHash, discoverNvim } from "./nvim";

const TEST_APP_NAME = "nvim-test";

function getDataDir(baseDir: string): string {
  return path.join(baseDir, TEST_APP_NAME, "pi-nvim");
}

function writeLockfile(
  dataDir: string,
  lockfileCwd: string,
  pid: number,
  fileName = `${cwdHash(lockfileCwd)}-${pid}.json`,
): string {
  const lockfilePath = path.join(dataDir, fileName);
  fs.writeFileSync(
    lockfilePath,
    JSON.stringify({
      socket: `/tmp/${pid}.sock`,
      cwd: lockfileCwd,
      pid,
    }),
  );
  return lockfilePath;
}

describe("discoverNvim", () => {
  let tempDir: string;
  let dataDir: string;
  let killSpy: ReturnType<typeof vi.spyOn>;
  let originalXdgDataHome: string | undefined;
  let originalNvimAppName: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-neovim-test-"));
    dataDir = getDataDir(tempDir);
    fs.mkdirSync(dataDir, { recursive: true });

    originalXdgDataHome = process.env.XDG_DATA_HOME;
    originalNvimAppName = process.env.NVIM_APPNAME;
    process.env.XDG_DATA_HOME = tempDir;
    process.env.NVIM_APPNAME = TEST_APP_NAME;

    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(() => {
    killSpy.mockRestore();
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }

    if (originalNvimAppName === undefined) {
      delete process.env.NVIM_APPNAME;
    } else {
      process.env.NVIM_APPNAME = originalNvimAppName;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prefers exact cwd matches over related child matches", () => {
    writeLockfile(dataDir, "/repo", 101);
    writeLockfile(dataDir, "/repo/sub", 102);

    const discovered = discoverNvim("/repo");

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.lockfile.cwd).toBe("/repo");
  });

  it("returns related matches sorted by closeness when exact matches are absent", () => {
    writeLockfile(dataDir, "/repo/b", 201);
    writeLockfile(dataDir, "/repo/a/deep", 202);
    writeLockfile(dataDir, "/repo/a", 203);

    const discovered = discoverNvim("/repo");

    expect(discovered.map((instance) => instance.lockfile.cwd)).toEqual([
      "/repo/a",
      "/repo/b",
      "/repo/a/deep",
    ]);
  });

  it("does not touch non-lockfile json files and removes malformed lockfiles", () => {
    const notePath = path.join(dataDir, "note.json");
    fs.writeFileSync(notePath, JSON.stringify({ note: "keep me" }));

    const malformedLockfile = path.join(dataDir, "deadbeef-999.json");
    fs.writeFileSync(malformedLockfile, "{not-json}");

    discoverNvim("/repo");

    expect(fs.existsSync(notePath)).toBe(true);
    expect(fs.existsSync(malformedLockfile)).toBe(false);
  });

  it("treats EPERM from process.kill(pid, 0) as process still running", () => {
    const pid = 777;
    const lockfilePath = writeLockfile(dataDir, "/repo/sub", pid);

    killSpy.mockImplementation((targetPid: number, signal: number) => {
      if (targetPid === pid && signal === 0) {
        const error = new Error(
          "operation not permitted",
        ) as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return true;
    });

    const discovered = discoverNvim("/repo");

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.lockfile.pid).toBe(pid);
    expect(fs.existsSync(lockfilePath)).toBe(true);
  });

  it("matches related directories through symlinked paths", () => {
    const realRoot = path.join(tempDir, "real");
    const realRepo = path.join(realRoot, "repo");
    const realSubdir = path.join(realRepo, "sub");
    fs.mkdirSync(realSubdir, { recursive: true });

    const symlinkRoot = path.join(tempDir, "link");
    fs.symlinkSync(realRoot, symlinkRoot);

    writeLockfile(dataDir, realSubdir, 888);

    const discovered = discoverNvim(path.join(symlinkRoot, "repo"));

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.lockfile.cwd).toBe(realSubdir);
  });
});
