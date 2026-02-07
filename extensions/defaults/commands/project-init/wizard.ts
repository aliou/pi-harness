/**
 * TUI wizard for /project:init.
 *
 * Phase 1: Loading spinner while scanning catalog/project/scout.
 * Phase 2: Multi-select list with scout recommendations highlighted.
 *
 * Ctrl+S to apply, Esc to cancel.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { CatalogEntry } from "./catalog";
import { scanCatalog } from "./catalog";
import { getInstalled, readSettings } from "./installer";
import { type ProjectStack, scanProject } from "./scanner";

export interface WizardItem {
  entry: CatalogEntry | null; // null for the AGENTS.md option
  label: string;
  description: string;
  checked: boolean;
  recommended: boolean;
}

export interface WizardResult {
  selectedEntries: CatalogEntry[];
  unselectedEntries: CatalogEntry[];
  generateAgents: boolean;
  /** Scout response text, if available. */
  scoutAnalysis: string | undefined;
  stack: ProjectStack;
}

/** Event name for cross-extension scout calls. */
const SCOUT_EXECUTE_EVENT = "scout:execute";

interface ScoutExecutePayload {
  input: { prompt: string; query?: string };
  resolve: (result: { content: string } | null) => void;
}

function callScout(
  pi: ExtensionAPI,
  prompt: string,
): Promise<{ content: string } | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 60_000);

    const payload: ScoutExecutePayload = {
      input: { prompt },
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
    };

    pi.events.emit(SCOUT_EXECUTE_EVENT, payload);
  });
}

function parseRecommendations(
  scoutResponse: string | null,
  catalog: CatalogEntry[],
): Set<string> {
  if (!scoutResponse) return new Set();

  const names = new Set<string>();
  const lower = scoutResponse.toLowerCase();

  for (const entry of catalog) {
    if (lower.includes(entry.name.toLowerCase())) {
      names.add(entry.name);
    }
  }

  return names;
}

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function buildItems(
  catalog: CatalogEntry[],
  installedSkills: Set<string>,
  installedPackages: Set<string>,
  recommendations: Set<string>,
): WizardItem[] {
  const items: WizardItem[] = [];

  const sorted = [...catalog].sort((a, b) => {
    const aRec = recommendations.has(a.name);
    const bRec = recommendations.has(b.name);
    if (aRec !== bRec) return aRec ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    const installed =
      entry.type === "skill"
        ? installedSkills.has(entry.path)
        : installedPackages.has(entry.path);
    const recommended = recommendations.has(entry.name);

    items.push({
      entry,
      label: entry.name,
      description: entry.description,
      checked: installed || recommended,
      recommended,
    });
  }

  items.push({
    entry: null,
    label: "Generate AGENTS.md",
    description:
      "Analyze the project and generate/update AGENTS.md with build commands, architecture, and style guidelines",
    checked: true,
    recommended: false,
  });

  return items;
}

export async function showWizard(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  catalogDirs: string[],
  catalogDepth: number,
): Promise<WizardResult | null> {
  return ctx.ui.custom<WizardResult | null>((tui, theme, _kb, done) => {
    // -- State --
    let phase: "loading" | "ready" = "loading";
    let loadingMessage = "Scanning catalog...";
    let spinnerIndex = 0;

    let catalog: CatalogEntry[] = [];
    let stack: ProjectStack = {
      languages: [],
      frameworks: [],
      tools: [],
      summary: "Scanning...",
    };
    let installedSkills = new Set<string>();
    let installedPackages = new Set<string>();
    let recommendations = new Set<string>();
    let scoutAnalysis: string | undefined;
    let items: WizardItem[] = [];
    let cursor = 0;
    let scrollOffset = 0;
    const maxVisible = 15;

    // Spinner timer
    const spinnerTimer = setInterval(() => {
      if (phase === "loading") {
        spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
        tui.requestRender();
      }
    }, 100);

    // -- Background loading --
    (async () => {
      // Scan catalog
      catalog = await scanCatalog(catalogDirs, catalogDepth);
      if (catalog.length === 0) {
        clearInterval(spinnerTimer);
        done(null);
        ctx.ui.notify(
          "No skills or packages found in catalog directories.",
          "warning",
        );
        return;
      }

      // Scan project
      loadingMessage = "Detecting project stack...";
      tui.requestRender();
      stack = await scanProject(ctx.cwd);

      // Read settings
      const settings = await readSettings(ctx.cwd);
      const installed = getInstalled(settings);
      installedSkills = installed.skills;
      installedPackages = installed.packages;

      // Show wizard immediately (no recommendations yet)
      recommendations = new Set();
      items = buildItems(
        catalog,
        installedSkills,
        installedPackages,
        recommendations,
      );
      phase = "ready";
      clearInterval(spinnerTimer);
      tui.requestRender();

      // Call scout in background
      const catalogSummary = catalog
        .map((e) => `- ${e.name} (${e.type}): ${e.description}`)
        .join("\n");

      const scoutPrompt = [
        `Project stack: ${stack.summary}`,
        "",
        "Available skills and packages:",
        catalogSummary,
        "",
        "Which of these skills and packages would be most useful for this project?",
        "List only the names of recommended items, one per line.",
      ].join("\n");

      const scoutResult = await callScout(pi, scoutPrompt);
      const content = scoutResult?.content ?? null;
      if (typeof content === "string" && content) {
        scoutAnalysis = content;
        recommendations = parseRecommendations(content, catalog);

        // Rebuild items preserving user's manual toggles
        const checkedByUser = new Set<string>();
        const uncheckedByUser = new Set<string>();
        for (const item of items) {
          if (!item.entry) continue;
          const wasAutoChecked =
            item.entry.type === "skill"
              ? installedSkills.has(item.entry.path)
              : installedPackages.has(item.entry.path);
          if (item.checked && !wasAutoChecked) checkedByUser.add(item.label);
          if (!item.checked && wasAutoChecked) uncheckedByUser.add(item.label);
        }

        items = buildItems(
          catalog,
          installedSkills,
          installedPackages,
          recommendations,
        );

        // Re-apply user toggles
        for (const item of items) {
          if (checkedByUser.has(item.label)) item.checked = true;
          if (uncheckedByUser.has(item.label)) item.checked = false;
        }

        tui.requestRender();
      }
    })();

    return {
      invalidate() {},

      render(width: number) {
        const lines: string[] = [];

        lines.push(theme.fg("accent", theme.bold("Project Init")));
        lines.push("");

        if (phase === "loading") {
          const frame = SPINNER_FRAMES[spinnerIndex] ?? "|";
          lines.push(theme.fg("dim", `  ${frame} ${loadingMessage}`));
          return lines;
        }

        // Stack summary
        lines.push(
          theme.fg("dim", truncateToWidth(`  ${stack.summary}`, width)),
        );
        lines.push("");

        // Items
        const visibleEnd = Math.min(scrollOffset + maxVisible, items.length);

        for (let i = scrollOffset; i < visibleEnd; i++) {
          const item = items[i];
          if (!item) continue;
          const isCursor = i === cursor;
          const checkbox = item.checked ? "[x]" : "[ ]";
          const prefix = isCursor ? "> " : "  ";
          const rec = item.recommended ? " *" : "";
          const typeTag = item.entry
            ? theme.fg("dim", ` (${item.entry.type})`)
            : "";

          let line = `${prefix}${checkbox} ${item.label}${rec}${typeTag}`;
          line = truncateToWidth(line, width);

          if (isCursor) {
            line = theme.fg("accent", line);
          }

          lines.push(line);
        }

        if (items.length > maxVisible) {
          lines.push(theme.fg("dim", `  (${cursor + 1}/${items.length})`));
        }

        const current = items[cursor];
        if (current?.description) {
          lines.push("");
          lines.push(
            theme.fg("dim", truncateToWidth(`  ${current.description}`, width)),
          );
        }

        lines.push("");
        if (recommendations.size > 0) {
          lines.push(theme.fg("dim", "  * = recommended by scout"));
        }
        lines.push(
          theme.fg(
            "dim",
            "  Space to toggle | Ctrl+S to apply | Esc to cancel",
          ),
        );

        return lines;
      },

      handleInput(data: string) {
        if (phase === "loading") {
          if (matchesKey(data, Key.escape)) {
            clearInterval(spinnerTimer);
            done(null);
          }
          return;
        }

        if (matchesKey(data, Key.up)) {
          cursor = cursor === 0 ? items.length - 1 : cursor - 1;
          if (cursor < scrollOffset) scrollOffset = cursor;
          if (cursor >= scrollOffset + maxVisible)
            scrollOffset = cursor - maxVisible + 1;
        } else if (matchesKey(data, Key.down)) {
          cursor = cursor === items.length - 1 ? 0 : cursor + 1;
          if (cursor >= scrollOffset + maxVisible)
            scrollOffset = cursor - maxVisible + 1;
          if (cursor < scrollOffset) scrollOffset = cursor;
        } else if (data === " ") {
          const item = items[cursor];
          if (item) item.checked = !item.checked;
        } else if (matchesKey(data, Key.ctrl("s"))) {
          clearInterval(spinnerTimer);
          const selected: CatalogEntry[] = [];
          const unselected: CatalogEntry[] = [];
          let generateAgents = false;

          for (const item of items) {
            if (!item.entry) {
              generateAgents = item.checked;
              continue;
            }
            if (item.checked) {
              selected.push(item.entry);
            } else {
              unselected.push(item.entry);
            }
          }

          done({
            selectedEntries: selected,
            unselectedEntries: unselected,
            generateAgents,
            scoutAnalysis,
            stack,
          });
        } else if (matchesKey(data, Key.escape)) {
          clearInterval(spinnerTimer);
          done(null);
        }

        tui.requestRender();
      },
    };
  });
}
