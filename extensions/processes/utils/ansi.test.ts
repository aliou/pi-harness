import { describe, expect, it } from "vitest";
import { hasAnsi, stripAnsi } from "./ansi";

describe("hasAnsi", () => {
  it("returns false for plain text", () => {
    expect(hasAnsi("hello world")).toBe(false);
  });

  it("returns true for text with a CSI sequence", () => {
    expect(hasAnsi("\x1b[31mred\x1b[0m")).toBe(true);
  });

  it("returns true for text with an OSC 8 hyperlink", () => {
    expect(hasAnsi("\x1b]8;;https://example.com\x07Link\x1b]8;;\x07")).toBe(
      true,
    );
  });

  it("returns true for text with an APC sequence", () => {
    expect(hasAnsi("\x1b_marker\x07")).toBe(true);
  });
});

describe("stripAnsi", () => {
  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips SGR color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("strips cursor movement sequences", () => {
    expect(stripAnsi("before\x1b[2Aafter")).toBe("beforeafter");
  });

  it("strips OSC 8 hyperlinks, preserving link text", () => {
    const input = "\x1b]8;;https://example.com\x07Link\x1b]8;;\x07";
    expect(stripAnsi(input)).toBe("Link");
  });

  it("strips APC sequences terminated with BEL", () => {
    expect(stripAnsi("\x1b_marker\x07")).toBe("");
  });

  it("strips APC sequences terminated with ESC\\", () => {
    expect(stripAnsi("\x1b_marker\x1b\\")).toBe("");
  });

  it("handles mixed content with multiple ANSI types", () => {
    const input = "\x1b[1mbold\x1b[0m plain \x1b[32mgreen\x1b[0m";
    expect(stripAnsi(input)).toBe("bold plain green");
  });

  it("returns empty string for empty input", () => {
    expect(stripAnsi("")).toBe("");
  });
});
