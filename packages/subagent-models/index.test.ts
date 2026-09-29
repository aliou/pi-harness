import { dirname, join } from "node:path";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ agentDir: "" }));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => mocks.agentDir,
}));

const {
  describeMissingRoster,
  getSubagentModelPreferences,
  getSubagentModelsConfigPath,
  loadSubagentModels,
  resetSubagentModelsCache,
} = await import("./index");

describe("subagent-models config", () => {
  beforeEach(() => {
    mocks.agentDir = "/agent";
    vol.mkdirSync(mocks.agentDir);
    resetSubagentModelsCache();
  });

  it("uses the global settings path", () => {
    expect(getSubagentModelsConfigPath()).toBe(
      join(mocks.agentDir, "settings", "subagent-models.json"),
    );
  });

  it("reports missing when the file does not exist", async () => {
    const result = await loadSubagentModels();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing");
    const preferences = await getSubagentModelPreferences("advisor");
    expect(preferences).toBeUndefined();
  });

  it.each([
    "not json",
    "null",
    "[]",
    '"value"',
    "42",
    "{}",
    '{"advisor": []}',
    '{"advisor": [{"provider": "anthropic"}]}',
    '{"advisor": [{"provider": "anthropic", "model": "m", "thinking": "bogus", "weight": 1}]}',
    '{"advisor": [{"provider": "anthropic", "model": "m", "thinking": "low", "weight": "1"}]}',
  ])("reports invalid config: %s", async (contents) => {
    await writeRawConfig(contents);

    const result = await loadSubagentModels();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
  });

  it("reads rosters by subagent name", async () => {
    await writeRawConfig(
      JSON.stringify({
        advisor: [
          {
            provider: "anthropic",
            model: "claude-opus-4-8",
            thinking: "xhigh",
            weight: 1,
          },
        ],
        scout: [
          {
            provider: "neuralwatt",
            model: "gemma-4-31b",
            thinking: "off",
            weight: 2,
          },
        ],
      }),
    );

    const advisor = await getSubagentModelPreferences("advisor");
    expect(advisor).toEqual([
      {
        provider: "anthropic",
        model: "claude-opus-4-8",
        thinking: "xhigh",
        weight: 1,
      },
    ]);
    const scout = await getSubagentModelPreferences("scout");
    expect(scout?.[0]?.weight).toBe(2);
    const oracle = await getSubagentModelPreferences("oracle");
    expect(oracle).toBeUndefined();
  });

  it("caches the load result", async () => {
    await writeRawConfig(
      JSON.stringify({
        advisor: [
          {
            provider: "anthropic",
            model: "claude-opus-4-8",
            thinking: "xhigh",
            weight: 1,
          },
        ],
      }),
    );

    const before = await getSubagentModelPreferences("advisor");
    expect(before).toBeDefined();

    // Remove the file; the cached value is still returned.
    vol.unlinkSync(configPath());
    const cached = await getSubagentModelPreferences("advisor");
    expect(cached).toBeDefined();

    resetSubagentModelsCache();
    const afterReset = await getSubagentModelPreferences("advisor");
    expect(afterReset).toBeUndefined();
  });

  it("describes load failures and missing rosters", async () => {
    const missing = await describeMissingRoster("advisor");
    expect(missing).toContain("is missing");

    resetSubagentModelsCache();
    await writeRawConfig("not json");
    const invalid = await describeMissingRoster("advisor");
    expect(invalid).toContain("is invalid");

    resetSubagentModelsCache();
    await writeRawConfig(
      JSON.stringify({
        scout: [
          {
            provider: "neuralwatt",
            model: "gemma-4-31b",
            thinking: "off",
            weight: 1,
          },
        ],
      }),
    );
    const unconfigured = await describeMissingRoster("advisor");
    expect(unconfigured).toContain('no model roster for "advisor"');
  });

  function configPath(): string {
    return join(mocks.agentDir, "settings", "subagent-models.json");
  }

  async function writeRawConfig(contents: string): Promise<void> {
    const path = configPath();
    vol.mkdirSync(dirname(path), { recursive: true });
    vol.writeFileSync(path, contents);
  }
});
