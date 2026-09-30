import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { describe, expect, it, vi } from "vitest";
import { askUserTool } from "./index";
import type { Params } from "./types";

const params: Params = {
  questions: [
    {
      question: "Which database?",
      header: "Database",
      multiSelect: false,
      options: [
        { label: "Postgres", description: "Relational" },
        { label: "SQLite", description: "Embedded" },
      ],
    },
  ],
};

function run(ctx: Partial<ExtensionContext>) {
  return askUserTool.execute(
    "tc_1",
    params,
    undefined,
    undefined,
    ctx as Parameters<typeof askUserTool.execute>[4],
  );
}

describe("ask_user result contract", () => {
  it("returns questions and answers as structured content", async () => {
    const select = vi.fn(async () => "Postgres — Relational");

    const result = await run({
      hasUI: true,
      mode: "rpc",
      ui: { select } as never,
    });

    expect(result.content).toEqual([
      { type: "text", text: "Database: Postgres" },
    ]);
    expectStructuredOutput(askUserTool, result);
    expect(result.structuredContent).toEqual({
      questions: params.questions,
      answers: [
        {
          question: "Which database?",
          header: "Database",
          selections: ["Postgres"],
        },
      ],
    });
  });

  it("reports cancellation as data, not an error", async () => {
    const select = vi.fn(async () => undefined);

    const result = await run({
      hasUI: true,
      mode: "rpc",
      ui: { select } as never,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: "User cancelled" }]);
    expectStructuredOutput(askUserTool, result);
    expect(result.structuredContent).toEqual({
      questions: params.questions,
      answers: [],
      cancelled: true,
    });
  });

  it("marks a missing UI as an error that still carries data", async () => {
    const result = await run({ hasUI: false });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Error: UI not available (running in non-interactive mode)",
      },
    ]);
    expectStructuredOutput(askUserTool, result);
    expect(result.structuredContent).toEqual({
      questions: params.questions,
      answers: [],
      error: "UI not available",
    });
  });

  it("declares read-only, closed-world annotations", () => {
    expect(askUserTool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
