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

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(tmpdir(), { recursive: true });
});
