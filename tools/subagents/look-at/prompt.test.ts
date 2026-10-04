import { describe, expect, it } from "vitest";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt";

describe("look-at system prompt", () => {
  it("requires observation before interpretation", () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(
      "Separate visible observations from interpretation",
    );
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("Do not infer hidden state");
  });
});
