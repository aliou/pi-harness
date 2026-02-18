import { describe, expect, it } from "vitest";
import { buildFallbackTitle, postProcessTitle } from "./title";

describe("buildFallbackTitle", () => {
  it("returns short text as-is after trimming", () => {
    expect(buildFallbackTitle("  hello  ")).toBe("hello");
  });

  it("returns text at exactly 50 chars as-is", () => {
    const text = "a".repeat(50);
    expect(buildFallbackTitle(text)).toBe(text);
  });

  it("truncates long text at word boundary with ...", () => {
    // 55 chars total, last word starts at index 47
    const text = "Fix the authentication bug in the middleware layer X";
    const result = buildFallbackTitle(text);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("...")).toBe(true);
    // Should break at a word boundary
    expect(result).not.toMatch(/\s\.\.\.$/);
  });

  it("truncates hard at 47 chars + ... when no spaces in truncation window", () => {
    const text = "a".repeat(60);
    const result = buildFallbackTitle(text);
    expect(result).toBe(`${"a".repeat(47)}...`);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(buildFallbackTitle("   ")).toBe("");
  });
});

describe("postProcessTitle", () => {
  it("returns a clean title as-is", () => {
    expect(postProcessTitle("Debug auth middleware")).toBe(
      "Debug auth middleware",
    );
  });

  it("strips <think>...</think> tags", () => {
    const raw = "<think>reasoning here</think> Fix database query";
    expect(postProcessTitle(raw)).toBe("Fix database query");
  });

  it("strips wrapping double quotes", () => {
    expect(postProcessTitle('"My title"')).toBe("My title");
  });

  it("strips wrapping single quotes", () => {
    expect(postProcessTitle("'My title'")).toBe("My title");
  });

  it("strips wrapping backticks", () => {
    expect(postProcessTitle("`My title`")).toBe("My title");
  });

  it("strips markdown bold", () => {
    expect(postProcessTitle("**My title**")).toBe("My title");
  });

  it("strips markdown headers", () => {
    expect(postProcessTitle("# My title")).toBe("My title");
  });

  it("strips Title: meta-prefix", () => {
    expect(postProcessTitle("Title: My title")).toBe("My title");
  });

  it("strips Summary: meta-prefix", () => {
    expect(postProcessTitle("Summary: My title")).toBe("My title");
  });

  it("strips Session: meta-prefix", () => {
    expect(postProcessTitle("Session: My title")).toBe("My title");
  });

  it("takes the first non-empty line from multi-line input", () => {
    expect(postProcessTitle("\n\nFirst line\nSecond line")).toBe("First line");
  });

  it("enforces max length of 50 chars, truncating at word boundary", () => {
    const long = "Fix the authentication bug in the middleware layer X";
    const result = postProcessTitle(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles combined: think tags + quotes + prefix all stripped", () => {
    const raw = '<think>some reasoning</think> "Title: My great title"';
    expect(postProcessTitle(raw)).toBe("My great title");
  });
});
