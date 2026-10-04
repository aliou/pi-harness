import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createToolContext } from "@harness/test-utils/pi-context";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTargetSessionPath } from "./utils";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    getAgentDir: () => mockSessionsRoot,
  };
});

let mockSessionsRoot: string;

const UUID_A = "019df481-d4ff-707d-855a-123f134ab466";
const UUID_B = "019df486-1371-749f-b2b0-f70783cd80e7";
const UUID_C = "019df499-aaaa-749f-b2b0-f70783cd80e7";

const FILE_A = `2026-05-04T19-40-42-624Z_${UUID_A}.jsonl`;
const FILE_B = `2026-05-04T19-45-20-754Z_${UUID_B}.jsonl`;
const FILE_C = `2026-05-04T20-10-00-000Z_${UUID_C}.jsonl`;

function makeCtx(targetSessionId: string): ExtensionContext {
  return createToolContext({
    entries: [
      {
        type: "custom",
        customType: "read-session-state",
        data: { targetSessionId, goal: "test" },
      },
    ],
  });
}

beforeEach(() => {
  mockSessionsRoot = "/tmp/read-session-test";
  const dirA = join(mockSessionsRoot, "sessions", "--project-a--");
  const dirB = join(mockSessionsRoot, "sessions", "--project-b--");

  const mkHeader = (id: string, ts: string, cwd: string) =>
    JSON.stringify({ type: "session", version: 3, id, timestamp: ts, cwd });

  vol.fromJSON({
    [join(dirA, FILE_A)]:
      `${mkHeader(UUID_A, "2026-05-04T19:40:42.624Z", "/project-a")}\n`,
    [join(dirB, FILE_B)]:
      `${mkHeader(UUID_B, "2026-05-04T19:45:20.754Z", "/project-b")}\n`,
    [join(dirA, FILE_C)]:
      `${mkHeader(UUID_C, "2026-05-04T20:10:00.000Z", "/project-a")}\n`,
  });
});

describe("getTargetSessionPath", () => {
  it.each([
    ["full UUID in project A", UUID_A, FILE_A, "--project-a--"],
    ["full UUID in project B", UUID_B, FILE_B, "--project-b--"],
    ["UUID prefix", "019df481-d4ff", FILE_A, "--project-a--"],
  ] as const)("resolves %s", async (_label, id, filename, dir) => {
    const result = await getTargetSessionPath(makeCtx(id));
    expect(result).toBe(join(mockSessionsRoot, "sessions", dir, filename));
  });

  it("passes through absolute file paths", async () => {
    const path = "/some/absolute/path.jsonl";
    const result = await getTargetSessionPath(makeCtx(path));
    expect(result).toBe(path);
  });

  it("passes through .jsonl filenames without slashes", async () => {
    const result = await getTargetSessionPath(makeCtx("session.jsonl"));
    expect(result).toBe("session.jsonl");
  });

  it("throws on non-existent UUID", async () => {
    await expect(
      getTargetSessionPath(makeCtx("deadbeef-0000-0000-0000-000000000000")),
    ).rejects.toThrow(/No session found/);
  });

  it("throws on ambiguous prefix matching multiple sessions", async () => {
    await expect(getTargetSessionPath(makeCtx("019df4"))).rejects.toThrow(
      /Ambiguous/,
    );
  });

  it("resolves exact UUID when prefix is ambiguous", async () => {
    const result = await getTargetSessionPath(makeCtx(UUID_C));
    expect(result).toBe(
      join(mockSessionsRoot, "sessions", "--project-a--", FILE_C),
    );
  });
});
