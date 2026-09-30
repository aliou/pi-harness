import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { createSubagent } from "./index";
import { SubagentOutputSchema } from "./runtime";

const Params = Type.Object({ task: Type.String() });

function registerSubagent(annotations?: ToolDefinition["annotations"]) {
  const tools: ToolDefinition[] = [];
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((tool: ToolDefinition) => tools.push(tool)),
  } as unknown as ExtensionAPI;
  createSubagent(pi, {
    name: "scout",
    label: "Scout",
    description: "Research",
    systemPrompt: "Research",
    tools: [],
    modelPreferences: [],
    resumable: true,
    parameters: Params,
    annotations,
    buildPrompt: () => ({ text: "task" }),
  }).register();
  return tools;
}

describe("subagent tool registration", () => {
  it("declares the shared output schema and read-only, open-world hints", () => {
    const tools = registerSubagent();

    expect(tools.map((tool) => tool.name)).toEqual(["scout", "resume_scout"]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBe(SubagentOutputSchema);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: true,
      });
    }
  });

  it("lets a subagent override the annotations", () => {
    const annotations = { readOnlyHint: false, destructiveHint: true };

    const tools = registerSubagent(annotations);

    expect(tools.every((tool) => tool.annotations === annotations)).toBe(true);
  });
});
