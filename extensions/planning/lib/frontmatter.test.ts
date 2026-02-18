import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  stringifyFrontmatter,
  updateFrontmatterField,
} from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter and returns an object", () => {
    const content = "---\ntitle: My Plan\nstatus: draft\n---\n\nBody text.";
    expect(parseFrontmatter(content)).toEqual({
      title: "My Plan",
      status: "draft",
    });
  });

  it("returns null when there is no frontmatter", () => {
    expect(parseFrontmatter("Just some content.")).toBeNull();
  });

  it("returns null for empty frontmatter block", () => {
    expect(parseFrontmatter("---\n\n---")).toBeNull();
  });

  it("parses various YAML types correctly", () => {
    const content =
      "---\nname: plan\ncount: 3\nactive: true\ntags:\n  - a\n  - b\n---";
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: "plan",
      count: 3,
      active: true,
      tags: ["a", "b"],
    });
  });

  it("returns null when top-level YAML is an array", () => {
    const content = "---\n- item1\n- item2\n---";
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null when top-level YAML is a scalar", () => {
    const content = "---\njust a string\n---";
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("ignores content after the closing ---", () => {
    const content = "---\ntitle: Test\n---\n\n# Body\n\nsome body text";
    const result = parseFrontmatter(content);
    expect(result).toEqual({ title: "Test" });
  });
});

describe("stringifyFrontmatter", () => {
  it("wraps YAML in --- delimiters", () => {
    const result = stringifyFrontmatter({ title: "Test" });
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("---")).toBe(true);
    expect(result).toContain("title: Test");
  });

  it("produces valid frontmatter for an empty object", () => {
    const result = stringifyFrontmatter({});
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("---")).toBe(true);
  });
});

describe("updateFrontmatterField", () => {
  it("updates an existing field in frontmatter", () => {
    const content = "---\nstatus: draft\n---\n\nBody.";
    const updated = updateFrontmatterField(content, "status", "completed");
    expect(parseFrontmatter(updated)).toMatchObject({ status: "completed" });
    expect(updated).toContain("Body.");
  });

  it("adds a new field to existing frontmatter", () => {
    const content = "---\ntitle: Test\n---\n\nBody.";
    const updated = updateFrontmatterField(content, "status", "in-progress");
    const fm = parseFrontmatter(updated);
    expect(fm).toMatchObject({ title: "Test", status: "in-progress" });
  });

  it("creates frontmatter when none exists and prepends to content", () => {
    const content = "# My Document\n\nSome content.";
    const updated = updateFrontmatterField(content, "status", "draft");
    expect(updated.startsWith("---\n")).toBe(true);
    expect(updated).toContain("# My Document");
    expect(parseFrontmatter(updated)).toMatchObject({ status: "draft" });
  });

  it("preserves the content body after frontmatter", () => {
    const body = "# Heading\n\nParagraph.";
    const content = `---\ntitle: Test\n---\n\n${body}`;
    const updated = updateFrontmatterField(content, "title", "Updated");
    expect(updated).toContain(body);
  });
});
