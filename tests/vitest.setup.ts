import "@harness/test-utils/matchers";
import { tmpdir } from "node:os";
import { vol } from "memfs";
import { beforeEach, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

// Tests must not inherit the host terminal: running the suite inside Herdr
// or Rex, or with PI_PROGRAM_STATUS set, would change what the notification
// hooks write.
const HOST_TERMINAL_ENV = ["HERDR_ENV", "PI_PROGRAM_STATUS", "REX_SESSION"];

beforeEach(() => {
  for (const name of HOST_TERMINAL_ENV) delete process.env[name];
  vol.reset();
  vol.mkdirSync(tmpdir(), { recursive: true });
});
