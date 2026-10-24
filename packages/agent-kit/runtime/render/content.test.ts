import type {
  AgentToolResult,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, Spacer, Text, visibleWidth } from "@earendil-works/pi-tui";
import { NOOP_THEME } from "@harness/test-utils/theme";
import { beforeAll, describe, expect, it } from "vitest";
import type { SubagentConfig } from "../../types";
import type { SubagentDetails } from "../types";
import { renderSubagentResult } from "./content";
import type { ToolRenderContext } from "./types";

const WIDTH = 24;

const details = {
  status: "running",
  activity: [
    {
      type: "thinking",
      startedAt: 0,
      endedAt: null,
      content: "First reasoning paragraph.\n\nSecond reasoning paragraph.",
    },
    { type: "tool_call", toolCallId: "tool-1", startedAt: 1 },
  ],
  toolCalls: [
    {
      toolCallId: "tool-1",
      toolName: "demo",
      args: {},
      status: "running",
      startedAt: 1,
      endedAt: null,
      error: null,
    },
  ],
  usage: { cost: { total: 0 } },
  responseTokens: 0,
  startedAt: 0,
  endedAt: null,
} as SubagentDetails;

const config = {
  tools: [
    {
      name: "demo",
      type: "native",
      render: () =>
        new Text(
          "Tool summary with a long description.\nFull tool detail.",
          0,
          0,
        ),
    },
  ],
} as unknown as SubagentConfig;

const result = { details, content: [] } as unknown as AgentToolResult<unknown>;
const ctx = { cwd: "/tmp/project" } as ToolRenderContext;

function render(expanded: boolean) {
  const options = { expanded, isPartial: true } as ToolRenderResultOptions;
  return renderSubagentResult(config, result, options, NOOP_THEME, ctx).render(
    WIDTH,
  );
}

describe("renderSubagentResult activity", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  it("renders each collapsed activity item on one bounded line", () => {
    const lines = render(false).filter((line) => line.trim().length > 0);
    const activityLines = lines.slice(0, 2);

    expect(activityLines).toHaveLength(2);
    expect(activityLines.every((line) => visibleWidth(line) <= WIDTH)).toBe(
      true,
    );
    expect(activityLines.every((line) => line.includes("…"))).toBe(true);
  });

  it("keeps full reasoning and tool details when expanded", () => {
    const output = render(true)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");

    expect(output).toContain("Second reasoning paragraph.");
    expect(output).toContain("Full tool detail.");
  });
});

describe("renderSubagentResult disclaimer", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  const finishedDetails = {
    ...details,
    status: "success",
    response: "The answer.",
    endedAt: 1,
  } as unknown as SubagentDetails;

  const disclaimerConfig = {
    tools: [],
    disclaimer: { before: "Before note.", after: "After note." },
  } as unknown as SubagentConfig;

  function renderFinished(expanded: boolean) {
    const finished = {
      details: finishedDetails,
      content: [],
    } as unknown as AgentToolResult<unknown>;
    const options = { expanded, isPartial: false } as ToolRenderResultOptions;
    return renderSubagentResult(
      disclaimerConfig,
      finished,
      options,
      NOOP_THEME,
      ctx,
    )
      .render(WIDTH)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  it("renders the notices around the answer without tags when expanded", () => {
    const output = renderFinished(true);

    expect(output.indexOf("Before note.")).toBeLessThan(
      output.indexOf("The answer."),
    );
    expect(output.indexOf("The answer.")).toBeLessThan(
      output.indexOf("After note."),
    );
    expect(output).not.toContain("<disclaimer>");
  });

  it("renders no notices when collapsed", () => {
    expect(renderFinished(false)).not.toContain("Before note.");
  });
});

describe("renderSubagentResult error", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  const errorDetails = {
    status: "error",
    error: "Scout subagent did not start within 5s — it produced no output.",
    response: undefined,
    activity: [],
    toolCalls: [],
    usage: { cost: { total: 0 } },
    responseTokens: 0,
    startedAt: 0,
    endedAt: 1,
  } as unknown as SubagentDetails;

  const withDetailsConfig = {
    tools: [],
    renderDetails: () => new Markdown("**CWD**\n/tmp/repo", 0, 0, {} as never),
  } as unknown as SubagentConfig;

  function renderResult(expanded: boolean) {
    const result = {
      details: errorDetails,
      content: [{ type: "text", text: errorDetails.error as string }],
    } as unknown as AgentToolResult<unknown>;
    const options = { expanded, isPartial: false } as ToolRenderResultOptions;
    return renderSubagentResult(
      withDetailsConfig,
      result,
      options,
      NOOP_THEME,
      ctx,
    );
  }

  it("adds an empty line above the error message when expanded with details", () => {
    const children = renderResult(true).children;
    // The error message is the last Markdown child (the details block is first).
    let lastIndex = -1;
    for (let i = 0; i < children.length; i++) {
      if (children[i] instanceof Markdown) lastIndex = i;
    }
    expect(lastIndex).toBeGreaterThan(0);
    // The child directly above it must be a Spacer (an empty line), not the
    // Separator that sits below the details block.
    expect(children[lastIndex - 1]).toBeInstanceOf(Spacer);
  });
});
