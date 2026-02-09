import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { renderInfoBox } from "../components/info-box";
import { TextViewer } from "../components/text-viewer";
import { parseSkills } from "../lib/parse-skills";

// ---------------------------------------------------------------------------
// Content builder
// ---------------------------------------------------------------------------

function buildContent(
  skills: { name: string; description: string }[],
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  if (skills.length === 0) {
    lines.push("No skills available");
    return lines;
  }

  lines.push(theme.fg("accent", theme.bold("Available Skills")));
  lines.push("");

  for (const skill of skills) {
    lines.push(...renderInfoBox(skill.name, skill.description, width, theme));
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerSkillsCommand(pi: ExtensionAPI) {
  pi.registerCommand("pi:skills", {
    description: "View all available skills",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const systemPrompt = ctx.getSystemPrompt();
      if (!systemPrompt) {
        ctx.ui.notify("No system prompt available", "warning");
        return;
      }

      const { skills } = parseSkills(systemPrompt);

      await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TextViewer(
          "Skills",
          (width, t) => buildContent(skills, width, t),
          tui,
          theme,
          () => done(undefined),
        );
      });
    },
  });
}
