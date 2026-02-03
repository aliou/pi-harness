import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import {
  Markdown,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { TextViewer } from "../components/text-viewer";

interface Skill {
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Skill parsing
// ---------------------------------------------------------------------------

const SKILLS_BLOCK_RE =
  /The following skills[\s\S]*?<available_skills>[\s\S]*?<\/available_skills>/;
const SKILL_RE =
  /<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>[\s\S]*?<\/location>\s*<\/skill>/g;

function parseSkills(prompt: string): {
  textWithoutSkills: string;
  skills: Skill[];
} {
  const blockMatch = prompt.match(SKILLS_BLOCK_RE);
  if (!blockMatch) {
    return { textWithoutSkills: prompt, skills: [] };
  }

  const textWithoutSkills = prompt.replace(SKILLS_BLOCK_RE, "").trimEnd();

  const skills: Skill[] = [];
  const xmlContent = blockMatch[0];
  for (const m of xmlContent.matchAll(SKILL_RE)) {
    skills.push({
      name: (m[1] ?? "").trim(),
      description: (m[2] ?? "").trim(),
    });
  }

  return { textWithoutSkills, skills };
}

// ---------------------------------------------------------------------------
// Skill box rendering
// ---------------------------------------------------------------------------

function renderSkillBox(skill: Skill, width: number, theme: Theme): string[] {
  // Minimum useful width.
  if (width < 10) {
    return [truncateToWidth(skill.name, width)];
  }

  const innerWidth = width - 4; // border + 1 char padding each side

  // -- Top: ┌─ name ──────┐ --
  const maxNameLen = Math.max(0, width - 6); // room for ┌─ ... ─┐
  const displayName = truncateToWidth(skill.name, maxNameLen);
  const nameVisible = visibleWidth(displayName);
  const topFill = Math.max(0, width - nameVisible - 5); // 5 = ┌─ + space around name + ─┐
  const top =
    theme.fg("borderMuted", "┌─") +
    theme.fg("accent", theme.bold(` ${displayName} `)) +
    theme.fg("borderMuted", `${"─".repeat(topFill)}┐`);

  // -- Body: │ description │ --
  const descLines =
    skill.description.length > 0
      ? wrapTextWithAnsi(skill.description, innerWidth)
      : [""];

  const body = descLines.map((line) => {
    const padLen = Math.max(0, innerWidth - visibleWidth(line));
    return (
      theme.fg("borderMuted", "│") +
      ` ${line}${" ".repeat(padLen)} ` +
      theme.fg("borderMuted", "│")
    );
  });

  // -- Bottom: └──────────────┘ --
  const bottom = theme.fg(
    "borderMuted",
    `└${"─".repeat(Math.max(0, width - 2))}┘`,
  );

  return [top, ...body, bottom];
}

// ---------------------------------------------------------------------------
// Content builder
// ---------------------------------------------------------------------------

function buildContent(
  promptText: string,
  skills: Skill[],
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  // Render the prompt text as markdown.
  const md = new Markdown(promptText, 0, 0, getMarkdownTheme());
  lines.push(...md.render(width));

  // Render skills as boxes.
  if (skills.length > 0) {
    lines.push("");
    lines.push(theme.fg("accent", theme.bold("Available Skills")));
    lines.push("");

    for (const skill of skills) {
      lines.push(...renderSkillBox(skill, width, theme));
      lines.push("");
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerSystemPromptCommand(pi: ExtensionAPI) {
  pi.registerCommand("system-prompt", {
    description: "View the current system prompt",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const systemPrompt = ctx.getSystemPrompt();
      if (!systemPrompt) {
        ctx.ui.notify("No system prompt available", "warning");
        return;
      }

      const { textWithoutSkills, skills } = parseSkills(systemPrompt);

      const result = await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TextViewer(
          "System Prompt",
          (width, t) => buildContent(textWithoutSkills, skills, width, t),
          tui,
          theme,
          () => done(undefined),
        );
      });

      // RPC fallback
      if (result === undefined) {
        ctx.ui.notify("/system-prompt requires interactive mode", "info");
      }
    },
  });
}
