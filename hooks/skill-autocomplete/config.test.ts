import { fs } from "memfs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  parsePinnedSkills,
  parseSkillsRoots,
  readCompletionConfig,
  resolvePinnedSkills,
  resolveSkillsRoots,
} from "./config";

const { mkdirSync, writeFileSync } = fs;

const CONFIG_PATH = "/agent/settings/completion.json";

function setConfig(config: unknown): void {
  mkdirSync("/agent/settings", { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config));
  vi.mocked(getAgentDir).mockReturnValue("/agent");
}

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: vi.fn(() => "/agent"),
}));

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => "/agent" };
});

import { getAgentDir } from "@earendil-works/pi-coding-agent";

afterEach(() => {
  vi.mocked(getAgentDir).mockReturnValue("/agent");
});

describe("parseSkillsRoots", () => {
  test("accepts objects with path and label", () => {
    expect(parseSkillsRoots([{ path: "~/skills", label: "personal" }])).toEqual(
      [{ path: "~/skills", label: "personal" }],
    );
  });

  test("trims path and label", () => {
    expect(
      parseSkillsRoots([{ path: "  ~/skills  ", label: "  personal  " }]),
    ).toEqual([{ path: "~/skills", label: "personal" }]);
  });

  test("rejects a non-array", () => {
    expect(() => parseSkillsRoots("~/skills")).toThrow(/array/);
  });

  test("rejects bare strings", () => {
    expect(() => parseSkillsRoots(["~/skills"])).toThrow(/skillsRoots\[0\]/);
  });

  test("rejects a missing label", () => {
    expect(() => parseSkillsRoots([{ path: "~/skills" }])).toThrow(/label/);
  });

  test("rejects a missing path", () => {
    expect(() => parseSkillsRoots([{ label: "personal" }])).toThrow(/path/);
  });

  test("rejects an empty path", () => {
    expect(() => parseSkillsRoots([{ path: "  ", label: "personal" }])).toThrow(
      /path/,
    );
  });
});

describe("parsePinnedSkills", () => {
  test("accepts an array of paths", () => {
    expect(parsePinnedSkills(["~/skills/alpha", "/abs/beta"])).toEqual([
      "~/skills/alpha",
      "/abs/beta",
    ]);
  });

  test("trims paths", () => {
    expect(parsePinnedSkills(["  ~/skills/alpha  "])).toEqual([
      "~/skills/alpha",
    ]);
  });

  test("accepts an empty array", () => {
    expect(parsePinnedSkills([])).toEqual([]);
  });

  test("rejects a non-array", () => {
    expect(() => parsePinnedSkills("~/skills/alpha")).toThrow(/array/);
  });

  test("rejects non-string entries", () => {
    expect(() => parsePinnedSkills([42])).toThrow(/pinned\[0\]/);
  });

  test("rejects an empty path", () => {
    expect(() => parsePinnedSkills(["  "])).toThrow(/pinned\[0\]/);
  });
});

describe("completion config resolution", () => {
  test("returns empty config when file is missing", () => {
    expect(readCompletionConfig()).toEqual({});
    expect(resolvePinnedSkills()).toEqual({ valid: [], missing: [] });
    expect(resolveSkillsRoots()).toEqual({ valid: [], missing: [] });
  });

  test("resolves existing and missing pinned skill paths", () => {
    mkdirSync("/agent/skills/agent-browser", { recursive: true });
    setConfig({
      pinned: ["~/skills/agent-browser", "~/skills/missing"],
    });

    expect(resolvePinnedSkills()).toEqual({
      valid: ["/agent/skills/agent-browser"],
      missing: ["~/skills/missing"],
    });
  });

  test("preserves an empty pinned array and validates its shape", () => {
    setConfig({ pinned: [] });
    expect(resolvePinnedSkills()).toEqual({ valid: [], missing: [] });

    setConfig({ pinned: null });
    expect(() => resolvePinnedSkills()).toThrow(/array/);
  });

  test("resolves labeled roots and missing paths", () => {
    mkdirSync("/agent/skills", { recursive: true });
    setConfig({
      skillsRoots: [
        { path: "~/skills", label: "local" },
        { path: "~/missing", label: "other" },
      ],
    });

    expect(resolveSkillsRoots()).toEqual({
      valid: [{ path: "/agent/skills", label: "local" }],
      missing: ["other:~/missing"],
    });
  });
});
