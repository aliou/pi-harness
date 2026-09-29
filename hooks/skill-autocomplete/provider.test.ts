import { join } from "node:path";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { vol } from "memfs";
import { expect, test, vi } from "vitest";
import { expandSkillReferences } from "./expand";
import { createSkillAutocompleteProvider, extractSkillToken } from "./provider";
import { listSkills, type SkillsRoot } from "./skills";

function addSkills(skills: Record<string, string>): SkillsRoot[] {
  const root = "/skills";
  vol.fromJSON(
    Object.fromEntries(
      Object.entries(skills).map(([name, content]) => [
        join(root, name, "SKILL.md"),
        content,
      ]),
    ),
  );
  return [{ path: root, label: "test" }];
}

const current = {
  getSuggestions: async () => null,
  applyCompletion: () => ({ lines: [], cursorLine: 0, cursorCol: 0 }),
} as AutocompleteProvider;

test("recognizes skill triggers with filter text", () => {
  expect(extractSkillToken("??")).toEqual({ trigger: "??", token: "" });
  expect(extractSkillToken("?vit")).toEqual({ trigger: "?", token: "vit" });
  expect(extractSkillToken("??vit")).toEqual({
    trigger: "??",
    token: "vit",
  });
});

test("shows nothing for bare ?", async () => {
  const provider = createSkillAutocompleteProvider(current, []);
  const suggestions = await provider.getSuggestions(["?"], 0, 1, {
    signal: new AbortController().signal,
  });

  expect(suggestions).toBeNull();
});

test("closes completion after a literal ? followed by space", async () => {
  let delegated = false;
  const provider = createSkillAutocompleteProvider(
    {
      ...current,
      getSuggestions: async () => {
        delegated = true;
        return {
          prefix: "",
          items: [{ value: "fallback", label: "fallback" }],
        };
      },
    },
    [],
  );

  const suggestions = await provider.getSuggestions(["? "], 0, 2, {
    signal: new AbortController().signal,
  });

  expect(suggestions).toBeNull();
  expect(delegated).toBe(false);
});

test("shows all skills for ??", async () => {
  const roots = addSkills({
    alpha:
      "---\nname: alpha\ndescription: Alpha skill description\n---\n\nalpha instructions",
    beta: "---\nname: beta\ndescription: Beta skill description\n---\n\nbeta instructions",
  });
  const provider = createSkillAutocompleteProvider(current, roots);
  const suggestions = await provider.getSuggestions(["??"], 0, 2, {
    signal: new AbortController().signal,
  });

  expect(suggestions).toMatchObject({
    prefix: "??",
    items: [
      { label: "alpha", description: "[test] Alpha skill description" },
      { label: "beta", description: "[test] Beta skill description" },
    ],
  });
});

test("shows filtered skills for ? token", async () => {
  const roots = addSkills({
    alpha:
      "---\nname: alpha\ndescription: Alpha skill description\n---\n\nalpha instructions",
    beta: "---\nname: beta\ndescription: Beta skill description\n---\n\nbeta instructions",
  });
  const provider = createSkillAutocompleteProvider(current, roots);
  const suggestions = await provider.getSuggestions(["?al"], 0, 3, {
    signal: new AbortController().signal,
  });

  expect(suggestions).toMatchObject({
    prefix: "?al",
    items: [{ label: "alpha", description: "[test] Alpha skill description" }],
  });
});

test("applies a skill completion by replacing the ? token", () => {
  const provider = createSkillAutocompleteProvider(current, []);
  const result = provider.applyCompletion(
    ["use ?alp"],
    0,
    8,
    { value: "alpha", label: "alpha" },
    "?alp",
  );

  expect(result).toEqual({
    lines: ["use ?alpha "],
    cursorLine: 0,
    cursorCol: 11,
  });
});

test("delegates applyCompletion when the prefix is not a skill token", () => {
  const delegated = vi.fn(() => ({
    lines: ["x"],
    cursorLine: 0,
    cursorCol: 1,
  }));
  const provider = createSkillAutocompleteProvider(
    { ...current, applyCompletion: delegated },
    [],
  );

  const result = provider.applyCompletion(
    ["@foo"],
    0,
    4,
    { value: "foo", label: "foo" },
    "@foo",
  );

  expect(delegated).toHaveBeenCalledOnce();
  expect(result).toEqual({ lines: ["x"], cursorLine: 0, cursorCol: 1 });
});

test("expands multiple skills and retains their names in prose", () => {
  const roots = addSkills({
    documentation:
      "---\nname: documentation\ndescription: Write docs\n---\n\nDocumentation instructions.",
    "ark-ui":
      "---\nname: ark-ui\ndescription: Use Ark UI\n---\n\nArk UI instructions.",
  });
  const result = expandSkillReferences(
    "read the ??documentation skill and the ??ark-ui skill",
    listSkills(roots),
  );

  expect(result.skills.map((skill) => skill.name)).toEqual([
    "documentation",
    "ark-ui",
  ]);
  expect(result.skills[0]?.xml).toContain(
    '<skill name="documentation" location="',
  );
  expect(result.skills[1]?.xml).toContain('<skill name="ark-ui" location="');
  expect(result.prose).toBe(
    "read the documentation skill and the ark-ui skill",
  );
});

test("does not partially expand a longer unknown reference", () => {
  const skills = [
    {
      name: "foo",
      fullPath: "/tmp/foo/SKILL.md",
      baseDir: "/tmp/foo",
      directory: "/tmp/foo",
      sourceLabel: "test",
    },
  ];

  expect(expandSkillReferences("use ?foo_bar", skills)).toEqual({
    prose: "use ?foo_bar",
    skills: [],
  });
});
