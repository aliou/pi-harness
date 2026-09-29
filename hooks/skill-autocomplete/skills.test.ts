import { join } from "node:path";
import { fs, vol } from "memfs";
import { expect, test } from "vitest";
import { listSkills, type SkillsRoot } from "./skills";

const { mkdirSync, writeFileSync } = fs;

const SKILL_HEADER = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${name} body`;

function withSkills(fn: (rootPath: string) => void): void {
  const root = "/skills";
  vol.mkdirSync(root);
  fn(root);
}

function singleRoot(rootPath: string): SkillsRoot[] {
  return [{ path: rootPath, label: "test" }];
}

test("discovers immediate subdirectories that directly contain SKILL.md", () => {
  withSkills((root) => {
    mkdirSync(join(root, "alpha"));
    mkdirSync(join(root, "beta"));
    writeFileSync(join(root, "alpha", "SKILL.md"), SKILL_HEADER("alpha", "A"));
    writeFileSync(join(root, "beta", "SKILL.md"), SKILL_HEADER("beta", "B"));

    const skills = listSkills(singleRoot(root));
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
  });
});

test("falls back to pi.skills manifest when a wrapper subdir has no SKILL.md", () => {
  withSkills((root) => {
    // `obsidian/` is a monorepo wrapper: no SKILL.md, but a package.json
    // declaring the nested skills via pi.skills.
    mkdirSync(join(root, "obsidian", "json-canvas"), { recursive: true });
    mkdirSync(join(root, "obsidian", "obsidian-cli"), { recursive: true });
    writeFileSync(
      join(root, "obsidian", "package.json"),
      JSON.stringify({
        name: "@x/obsidian",
        pi: {
          skills: ["./json-canvas/SKILL.md", "./obsidian-cli/SKILL.md"],
        },
      }),
    );
    writeFileSync(
      join(root, "obsidian", "json-canvas", "SKILL.md"),
      SKILL_HEADER("json-canvas", "Canvas skill"),
    );
    writeFileSync(
      join(root, "obsidian", "obsidian-cli", "SKILL.md"),
      SKILL_HEADER("obsidian-cli", "CLI skill"),
    );

    const skills = listSkills(singleRoot(root));
    expect(skills.map((s) => s.name).sort()).toEqual([
      "json-canvas",
      "obsidian-cli",
    ]);
  });
});

test("direct SKILL.md takes precedence over a package.json manifest", () => {
  withSkills((root) => {
    mkdirSync(join(root, "alpha"), { recursive: true });
    writeFileSync(join(root, "alpha", "SKILL.md"), SKILL_HEADER("alpha", "A"));
    // A stray manifest that should be ignored because SKILL.md is present.
    writeFileSync(
      join(root, "alpha", "package.json"),
      JSON.stringify({ pi: { skills: ["./does-not-exist/SKILL.md"] } }),
    );

    const skills = listSkills(singleRoot(root));
    expect(skills.map((s) => s.name)).toEqual(["alpha"]);
  });
});

test("ignores subdirs without SKILL.md and without a pi.skills manifest", () => {
  withSkills((root) => {
    mkdirSync(join(root, "empty"));
    mkdirSync(join(root, "beta"));
    writeFileSync(join(root, "beta", "SKILL.md"), SKILL_HEADER("beta", "B"));
    writeFileSync(
      join(root, "empty", "package.json"),
      JSON.stringify({ name: "empty", pi: {} }),
    );

    const skills = listSkills(singleRoot(root));
    expect(skills.map((s) => s.name)).toEqual(["beta"]);
  });
});

test("skips hidden and node_modules directories", () => {
  withSkills((root) => {
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    mkdirSync(join(root, "node_modules", "ghost"), { recursive: true });
    mkdirSync(join(root, "beta"));
    writeFileSync(join(root, ".git", "hooks", "SKILL.md"), "stray");
    writeFileSync(join(root, "node_modules", "ghost", "SKILL.md"), "stray");
    writeFileSync(join(root, "beta", "SKILL.md"), SKILL_HEADER("beta", "B"));

    const skills = listSkills(singleRoot(root));
    expect(skills.map((s) => s.name)).toEqual(["beta"]);
  });
});

test("first root wins on name collision across roots", () => {
  const rootA = "/skills-a";
  const rootB = "/skills-b";
  vol.mkdirSync(rootA);
  vol.mkdirSync(rootB);
  mkdirSync(join(rootA, "shared"));
  mkdirSync(join(rootB, "shared"));
  writeFileSync(
    join(rootA, "shared", "SKILL.md"),
    SKILL_HEADER("shared", "from A"),
  );
  writeFileSync(
    join(rootB, "shared", "SKILL.md"),
    SKILL_HEADER("shared", "from B"),
  );

  const skills = listSkills([
    { path: rootA, label: "A" },
    { path: rootB, label: "B" },
  ]);
  expect(skills).toHaveLength(1);
  expect(skills[0]?.sourceLabel).toBe("A");
});
