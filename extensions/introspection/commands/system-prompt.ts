import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import type { Tab } from "../components/tabbed-viewer";
import { TabbedViewer } from "../components/tabbed-viewer";
import {
  type PromptSection,
  parsePromptSections,
} from "../lib/parse-prompt-sections";
import { parseSkills } from "../lib/parse-skills";
import { getBasePrompt } from "../lib/prompt-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMarkdown(text: string, width: number, _theme: Theme): string[] {
  const md = new Markdown(text, 0, 0, getMarkdownTheme());
  return md.render(width);
}

function sectionToTab(section: PromptSection): Tab {
  return {
    label: section.label,
    subtitle: section.path,
    buildContent: (width, theme) =>
      renderMarkdown(section.content, width, theme),
  };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerSystemPromptCommand(pi: ExtensionAPI) {
  pi.registerCommand("pi:prompt", {
    description: "View the current system prompt (tabbed by section)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const systemPrompt = ctx.getSystemPrompt();
      if (!systemPrompt) {
        ctx.ui.notify("No system prompt available", "warning");
        return;
      }

      // Strip skills block - those are shown via /i:skills.
      const { textWithoutSkills } = parseSkills(systemPrompt);

      // Also strip skills from the cached base prompt for accurate diffing.
      const rawBase = getBasePrompt();
      const baseForDiff = rawBase
        ? parseSkills(rawBase).textWithoutSkills
        : undefined;

      const sections = parsePromptSections(textWithoutSkills, baseForDiff);
      const tabs = sections.map(sectionToTab);

      if (tabs.length === 0) {
        ctx.ui.notify("System prompt is empty", "info");
        return;
      }

      await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TabbedViewer("System Prompt", tabs, tui, theme, () =>
          done(undefined),
        );
      });
    },
  });
}
