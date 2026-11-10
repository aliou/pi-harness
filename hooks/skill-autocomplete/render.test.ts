import {
  type Keybinding,
  stripTerminalSequences,
} from "@earendil-works/pi-tui";
import type { SkillMessageTheme } from "@harness/ui";
import { assert, describe, expect, it } from "vitest";
import { renderSkillInvocation } from "./render";

const theme: SkillMessageTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
  italic: (text) => text,
  strikethrough: (text) => text,
  underline: (text) => text,
};

const message = {
  role: "custom" as const,
  customType: "skill-invocation",
  content:
    '<skill name="vitest" location="/skills/vitest/SKILL.md">\nReferences are relative to /skills/vitest.\n\n# Vitest\n\nUse **vitest**.\n</skill>',
  display: true,
  details: {
    name: "vitest",
    path: "/skills/vitest/SKILL.md",
    description: "Vitest testing patterns and conventions.",
  },
  timestamp: 0,
};

function renderPlain(expanded: boolean): string[] {
  const hints = {
    keyText: () => "",
    keyHint: (_keybinding: Keybinding, description: string) => description,
  };
  const component = renderSkillInvocation(
    message,
    { expanded, outputPad: 0, ...hints },
    theme as Parameters<typeof renderSkillInvocation>[2],
  );
  assert(component, "component should render");
  return component
    .render(120)
    .map((line) => stripTerminalSequences(line).trimEnd());
}

describe("renderSkillInvocation", () => {
  it("shows the description while collapsed", () => {
    const lines = renderPlain(false);
    expect(lines.some((line) => line.includes("[skill] vitest"))).toBe(true);
    expect(
      lines.some((line) =>
        line.includes("Vitest testing patterns and conventions."),
      ),
    ).toBe(true);
    expect(lines.some((line) => line.includes("Use **vitest**"))).toBe(false);
  });

  it("shows markdown-rendered skill content when expanded", () => {
    const lines = renderPlain(true);
    expect(lines.some((line) => line.includes("[skill]"))).toBe(true);
    expect(lines.some((line) => line.includes("# Vitest"))).toBe(false);
    expect(lines.some((line) => line.includes("Use vitest."))).toBe(true);
  });
});
