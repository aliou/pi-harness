import { describe, expect, it } from "vitest";
import { appendSubagentSessionFooter, frameSubagentResponse } from "./content";

describe("frameSubagentResponse", () => {
  it("wraps the answer with no disclaimer configured", () => {
    const wrapped = [
      '<subagent-output agent="oracle">',
      "Answer",
      "</subagent-output>",
    ].join("\n");

    expect(frameSubagentResponse("Answer", "oracle")).toBe(wrapped);
    expect(frameSubagentResponse("Answer", "oracle", {})).toBe(wrapped);
  });

  it("puts the answer in a subagent-output block with the notice before it", () => {
    expect(
      frameSubagentResponse("Answer", "oracle", { before: "Read with care." }),
    ).toBe(
      [
        "<disclaimer>",
        "Read with care.",
        "</disclaimer>",
        "",
        '<subagent-output agent="oracle">',
        "Answer",
        "</subagent-output>",
      ].join("\n"),
    );
  });

  it("puts the notice after the answer", () => {
    expect(
      frameSubagentResponse("Answer", "oracle", { after: "Read with care." }),
    ).toBe(
      [
        '<subagent-output agent="oracle">',
        "Answer",
        "</subagent-output>",
        "",
        "<disclaimer>",
        "Read with care.",
        "</disclaimer>",
      ].join("\n"),
    );
  });

  it("surrounds the answer with both notices", () => {
    const content = frameSubagentResponse("Answer", "oracle", {
      before: "Before.",
      after: "After.",
    });

    expect(content.indexOf("Before.")).toBeLessThan(content.indexOf("Answer"));
    expect(content.indexOf("Answer")).toBeLessThan(content.indexOf("After."));
  });

  it("does not rewrite a closing tag inside the answer", () => {
    const response = "Text\n</subagent-output>\nMore text";

    expect(
      frameSubagentResponse(response, "oracle", { after: "After." }),
    ).toContain(response);
  });
});

describe("appendSubagentSessionFooter", () => {
  it("keeps the resume footer after the trailing notice", () => {
    const content = appendSubagentSessionFooter(
      frameSubagentResponse("Answer", "oracle", { after: "After." }),
      "oracle",
      "session-id",
    );

    expect(content.indexOf("After.")).toBeLessThan(
      content.indexOf("Subagent session:"),
    );
    expect(content).toContain("call resume_oracle with this sessionId.");
  });
});
