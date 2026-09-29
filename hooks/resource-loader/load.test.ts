import { join } from "node:path";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { appendLocalAgents, loadLocalAgentsFile } from "./load";

describe("resource-loader/load", () => {
  it("returns null when .agents/AGENTS.local.md is absent", () => {
    expect(loadLocalAgentsFile("/project")).toBeNull();
  });

  it("loads the file when present at cwd only", () => {
    const agentsDir = "/project/.agents";
    vol.fromJSON({
      [join(agentsDir, "AGENTS.local.md")]: "# local\nbody here",
    });
    const result = loadLocalAgentsFile("/project");
    expect(result).not.toBeNull();
    expect(result?.path).toBe(join(agentsDir, "AGENTS.local.md"));
    expect(result?.content).toContain("body here");
  });

  it("does not look in parent directories", () => {
    vol.fromJSON({
      "/project/.agents/AGENTS.local.md": "parent body",
      "/project/child/.keep": "",
    });
    expect(loadLocalAgentsFile("/project/child")).toBeNull();
  });

  it("appends content wrapped in Pi's <project_context> format", () => {
    const file = { path: "/x/.agents/AGENTS.local.md", content: "do X" };
    const next = appendLocalAgents("base prompt", file);
    expect(next).toContain("base prompt");
    expect(next).toContain("<project_context>");
    expect(next).toContain("</project_context>");
    expect(next).toContain(
      '<project_instructions path="/x/.agents/AGENTS.local.md">',
    );
    expect(next).toContain("do X");
  });

  it("escapes XML special chars in the path", () => {
    const file = { path: "/x & <y>/AGENTS.local.md", content: "body" };
    const next = appendLocalAgents("base", file);
    expect(next).toContain("&amp;");
    expect(next).toContain("&lt;y&gt;");
  });

  it("leaves the prompt unchanged when file is null or empty", () => {
    expect(appendLocalAgents("base", null)).toBe("base");
    expect(appendLocalAgents("base", { path: "/x", content: "   \n  " })).toBe(
      "base",
    );
  });
});
