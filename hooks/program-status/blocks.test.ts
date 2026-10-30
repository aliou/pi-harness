import { describe, expect, it } from "vitest";
import {
  addBlock,
  askUserBlock,
  type Block,
  currentStatus,
  removeBlock,
  shouldReportProgramStatus,
} from "./blocks";

const first: Block = { toolCallId: "tc_1", label: "First" };
const second: Block = { toolCallId: "tc_2", label: "Second" };

describe("shouldReportProgramStatus", () => {
  it("reports to a terminal", () => {
    expect(shouldReportProgramStatus({}, true)).toBe(true);
  });

  it("skips non-terminal stdout", () => {
    expect(shouldReportProgramStatus({}, false)).toBe(false);
  });

  it("honors PI_PROGRAM_STATUS=0", () => {
    expect(shouldReportProgramStatus({ PI_PROGRAM_STATUS: "0" }, true)).toBe(
      false,
    );
  });
});

describe("askUserBlock", () => {
  it("accepts ask_user attention with a tool call id", () => {
    expect(askUserBlock({ toolName: "ask_user", toolCallId: "tc_1" })).toEqual({
      toolCallId: "tc_1",
      label: "Ask user question",
    });
  });

  it("ignores other attention events", () => {
    expect(askUserBlock({ toolName: "bash", toolCallId: "tc_1" })).toBe(
      undefined,
    );
    expect(askUserBlock({ toolName: "ask_user" })).toBe(undefined);
    expect(askUserBlock({ description: "Path access" })).toBe(undefined);
  });
});

describe("block list", () => {
  it("ignores a second block for the same tool call", () => {
    const blocks = [first];
    expect(addBlock(blocks, first)).toBe(blocks);
  });

  it("removes blocks by id and keeps the list when nothing matches", () => {
    const blocks = [first, second];
    expect(removeBlock(blocks, "tc_1")).toEqual([second]);
    expect(removeBlock(blocks, "tc_3")).toBe(blocks);
  });
});

describe("currentStatus", () => {
  it("reports the newest block", () => {
    expect(currentStatus([first, second], true, "name")).toEqual({
      state: "blocked",
      kind: "question",
      app: "pi",
      message: "Second",
    });
  });

  it("restores working with the session name during a run", () => {
    expect(currentStatus([], true, "name")).toEqual({
      state: "working",
      app: "pi",
      message: "name",
    });
  });

  it("restores idle outside a run", () => {
    expect(currentStatus([], false, "name")).toEqual({
      state: "idle",
      app: "pi",
    });
  });
});
