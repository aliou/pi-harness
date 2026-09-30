import { describe, expect, it } from "vitest";
import { capText } from "./cap-text";

describe("capText", () => {
  it("returns short text unchanged", () => {
    expect(capText("hello", 10)).toEqual({ text: "hello", truncated: false });
  });

  it("keeps the head and tail around an omission marker", () => {
    const result = capText("aaaaabbbbbccccc", 10);

    expect(result).toEqual({
      text: "aaaaa\n\n[... 5 bytes omitted ...]\n\nccccc",
      truncated: true,
    });
  });

  it("cuts at character boundaries", () => {
    // "é" is two bytes; a 5-byte half would split one.
    const result = capText("éééééééééé", 10);

    expect(result.truncated).toBe(true);
    expect(result.text).not.toContain("\uFFFD");
    expect(result.text.startsWith("éé")).toBe(true);
    expect(result.text.endsWith("éé")).toBe(true);
  });
});
