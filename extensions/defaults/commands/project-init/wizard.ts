/**
 * TUI wizard for /project:init.
 *
 * Four-step wizard using the Wizard component from @aliou/pi-utils-settings:
 * 1. Packages — multi-select packages from the catalog
 * 2. Skills — multi-select skills (skills bundled with checked packages are locked)
 * 3. Nix — select shell/flake strategy
 * 4. AGENTS.md — toggle generation and pick target directories
 *
 * Ctrl+S to apply, Esc to cancel.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  FuzzyMultiSelector,
  type FuzzyMultiSelectorItem,
  Wizard,
  type WizardStepContext,
} from "@aliou/pi-utils-settings";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import type { CatalogEntry } from "./catalog";
import { scanCatalog } from "./catalog";
import { getInstalled, readSettings } from "./installer";
import { findChildProjects, type ProjectStack, scanProject } from "./scanner";

export type NixChoice = "shell.nix" | "flake.nix" | "skip";

export interface WizardResult {
  selectedEntries: CatalogEntry[];
  unselectedEntries: CatalogEntry[];
  nixChoice: NixChoice;
  nixHasShell: boolean;
  nixHasFlake: boolean;
  generateAgents: boolean;
  agentsPrompt: string | null;
  agentsDirs: string[];
  stack: ProjectStack;
}

// ---------------------------------------------------------------------------
// Shared mutable state across wizard steps
// ---------------------------------------------------------------------------

interface WizardState {
  catalog: CatalogEntry[];
  stack: ProjectStack;
  installedSkills: Set<string>;
  installedPackages: Set<string>;

  // Items mutated by steps
  packageItems: FuzzyMultiSelectorItem[];
  skillItems: FuzzyMultiSelectorItem[];
  nixChoice: NixChoice;
  nixHasShell: boolean;
  nixHasFlake: boolean;
  generateAgents: boolean;
  agentsPrompt: string;
  agentsDirItems: Array<{ path: string; checked: boolean }>;
}

// ---------------------------------------------------------------------------
// Step 1: Packages
// ---------------------------------------------------------------------------

class PackagesStep implements Component {
  private selector: FuzzyMultiSelector;

  constructor(
    state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    // Always valid (0 packages is fine)
    wizardCtx.markComplete();

    this.selector = new FuzzyMultiSelector({
      label: "Packages",
      items: state.packageItems,
      theme: settingsTheme,
      onToggle: () => {
        // Recompute skill locks when packages change
        recomputeSkillLocks(state);
      },
    });
  }

  render(width: number): string[] {
    return this.selector.render(width);
  }

  invalidate(): void {
    this.selector.invalidate?.();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    this.selector.handleInput(data);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Skills
// ---------------------------------------------------------------------------

class SkillsStep implements Component {
  private selector: FuzzyMultiSelector;

  constructor(
    private state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    wizardCtx.markComplete();

    // Ensure locks are current when entering this step
    recomputeSkillLocks(state);

    this.selector = new FuzzyMultiSelector({
      label: "Skills",
      items: state.skillItems,
      theme: settingsTheme,
    });
  }

  render(width: number): string[] {
    // Re-apply locks every render in case packages changed via tab navigation
    recomputeSkillLocks(this.state);
    this.selector.refresh();
    return this.selector.render(width);
  }

  invalidate(): void {
    this.selector.invalidate?.();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    this.selector.handleInput(data);
  }
}

// ---------------------------------------------------------------------------
// Step 3: Nix Dev Shell
// ---------------------------------------------------------------------------

interface NixOption {
  value: NixChoice;
  label: string;
  hint: string;
}

function getNixOptions(state: WizardState): NixOption[] {
  const options: NixOption[] = [
    {
      value: "shell.nix",
      label: "shell.nix",
      hint: state.nixHasShell
        ? "Update existing shell.nix and keep .envrc as `use nix`."
        : state.nixHasFlake
          ? "Switch from flake.nix to shell.nix and update .envrc to `use nix`."
          : "Create shell.nix. Pairs with .envrc containing `use nix`.",
    },
    {
      value: "flake.nix",
      label: "flake.nix",
      hint: state.nixHasFlake
        ? "Update existing flake.nix and keep .envrc as `use flake`."
        : state.nixHasShell
          ? "Switch from shell.nix to flake.nix and update .envrc to `use flake`."
          : "Create flake.nix. Pairs with .envrc containing `use flake`.",
    },
  ];

  options.push({
    value: "skip",
    label: "Skip",
    hint: "Do not create or modify Nix files.",
  });

  return options;
}

class NixStep implements Component {
  private settingsTheme: SettingsListTheme;
  private selectedIndex: number;

  constructor(
    private state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.settingsTheme = settingsTheme;
    wizardCtx.markComplete();

    const options = getNixOptions(state);
    const currentIdx = options.findIndex((o) => o.value === state.nixChoice);
    this.selectedIndex = currentIdx >= 0 ? currentIdx : 0;
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    const options = getNixOptions(this.state);

    if (this.selectedIndex >= options.length) {
      this.selectedIndex = Math.max(0, options.length - 1);
    }

    lines.push(this.settingsTheme.label(" Nix Dev Shell", true));
    lines.push("");

    if (this.state.nixHasShell && this.state.nixHasFlake) {
      lines.push(
        this.settingsTheme.hint("  Existing: shell.nix and flake.nix detected"),
      );
    } else if (this.state.nixHasShell) {
      lines.push(this.settingsTheme.hint("  Existing: shell.nix detected"));
    } else if (this.state.nixHasFlake) {
      lines.push(this.settingsTheme.hint("  Existing: flake.nix detected"));
    } else {
      lines.push(this.settingsTheme.hint("  No existing Nix shell detected"));
    }
    lines.push("");

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (!opt) continue;
      const isSelected = i === this.selectedIndex;
      const isCurrent = this.state.nixChoice === opt.value;
      const prefix = isSelected ? this.settingsTheme.cursor : "  ";
      const radio = isCurrent ? "(x)" : "( )";
      const label = this.settingsTheme.value(
        `${radio} ${opt.label}`,
        isSelected,
      );
      lines.push(`${prefix}${label}`);
    }

    // Hint for selected option
    const current = options[this.selectedIndex];
    if (current) {
      lines.push("");
      lines.push(this.settingsTheme.hint(`  ${current.hint}`));
    }

    lines.push("");
    lines.push(
      this.settingsTheme.hint(
        "  Enter select · Update/create/switch Nix shell + .envrc",
      ),
    );

    return lines;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;

    const options = getNixOptions(this.state);
    if (options.length === 0) return;

    if (this.selectedIndex >= options.length) {
      this.selectedIndex = options.length - 1;
    }

    if (matchesKey(data, Key.up)) {
      this.selectedIndex =
        this.selectedIndex === 0 ? options.length - 1 : this.selectedIndex - 1;
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.selectedIndex =
        this.selectedIndex === options.length - 1 ? 0 : this.selectedIndex + 1;
      return;
    }

    if (data === " " || matchesKey(data, Key.enter)) {
      const opt = options[this.selectedIndex];
      if (opt) {
        this.state.nixChoice = opt.value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: AGENTS.md
// ---------------------------------------------------------------------------

/** Max visible directory rows in the AGENTS.md step. */
const AGENTS_MAX_VISIBLE = 14;

class AgentsStep implements Component {
  private settingsTheme: SettingsListTheme;
  private selectedIndex = 0;
  private promptInput: Input;

  constructor(
    private state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.settingsTheme = settingsTheme;
    this.promptInput = new Input();
    if (state.agentsPrompt) this.promptInput.setValue(state.agentsPrompt);
    this.promptInput.onSubmit = () => {
      this.state.agentsPrompt = this.promptInput.getValue().trim();
    };
    wizardCtx.markComplete();
  }

  private get totalItems(): number {
    return this.state.generateAgents ? 2 + this.state.agentsDirItems.length : 1;
  }

  render(width: number): string[] {
    const lines: string[] = [];

    lines.push(this.settingsTheme.label(" AGENTS.md", true));
    lines.push("");

    // Toggle for generation
    const genCheck = this.state.generateAgents ? "[x]" : "[ ]";
    const isGenSelected = this.selectedIndex === 0;
    const genPrefix = isGenSelected ? this.settingsTheme.cursor : "  ";
    const genText = this.settingsTheme.value(
      `${genCheck} Generate / update AGENTS.md`,
      isGenSelected,
    );
    lines.push(`${genPrefix}${genText}`);
    lines.push("");

    if (this.state.generateAgents) {
      const isPromptSelected = this.selectedIndex === 1;
      const promptPrefix = isPromptSelected ? this.settingsTheme.cursor : "  ";
      lines.push(this.settingsTheme.hint("  Extra prompt (optional):"));
      lines.push(
        `${promptPrefix}${this.promptInput.render(width - 2).join("")}`,
      );
      lines.push("");
    }

    // Directory list
    if (this.state.generateAgents && this.state.agentsDirItems.length > 0) {
      const checkedCount = this.state.agentsDirItems.filter(
        (d) => d.checked,
      ).length;
      lines.push(
        this.settingsTheme.hint(
          `  Target directories (${checkedCount}/${this.state.agentsDirItems.length} selected):`,
        ),
      );
      lines.push("");

      const dirCount = this.state.agentsDirItems.length;
      const dirCursor = this.selectedIndex - 2;

      const startIndex = Math.max(
        0,
        Math.min(
          dirCursor - Math.floor(AGENTS_MAX_VISIBLE / 2),
          dirCount - AGENTS_MAX_VISIBLE,
        ),
      );
      const endIndex = Math.min(startIndex + AGENTS_MAX_VISIBLE, dirCount);

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.state.agentsDirItems[i];
        if (!item) continue;

        const listIndex = i + 2;
        const isSelected = this.selectedIndex === listIndex;
        const prefix = isSelected ? this.settingsTheme.cursor : "  ";
        const check = item.checked ? "[x]" : "[ ]";
        const label = this.settingsTheme.value(
          `${check} ${item.path}`,
          isSelected,
        );
        lines.push(`${prefix}${label}`);
      }

      // Scroll indicator
      if (dirCount > AGENTS_MAX_VISIBLE) {
        const pos = Math.max(0, dirCursor);
        lines.push(this.settingsTheme.hint(`  (${pos + 1}/${dirCount})`));
      }
    }

    lines.push("");
    lines.push(
      this.settingsTheme.hint(
        "  Space toggle · Enter edit input · Ctrl+S submit",
      ),
    );

    return lines;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;

    const total = this.totalItems;

    if (this.selectedIndex === 1 && this.state.generateAgents) {
      if (matchesKey(data, Key.up)) {
        this.selectedIndex = 0;
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.selectedIndex = this.state.agentsDirItems.length > 0 ? 2 : 0;
        return;
      }

      this.promptInput.handleInput(data);
      this.state.agentsPrompt = this.promptInput.getValue().trim();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.selectedIndex =
        this.selectedIndex === 0 ? total - 1 : this.selectedIndex - 1;
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.selectedIndex =
        this.selectedIndex === total - 1 ? 0 : this.selectedIndex + 1;
      return;
    }

    if (data === " " || matchesKey(data, Key.enter)) {
      if (this.selectedIndex === 0) {
        this.state.generateAgents = !this.state.generateAgents;
        this.selectedIndex = 0;
      } else if (this.selectedIndex >= 2) {
        const dirItem = this.state.agentsDirItems[this.selectedIndex - 2];
        if (dirItem) {
          dirItem.checked = !dirItem.checked;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lock computation
// ---------------------------------------------------------------------------

function recomputeSkillLocks(state: WizardState): void {
  // Reset all locks
  for (const item of state.skillItems) {
    item.locked = false;
    item.lockedBy = undefined;
  }

  // Find checked packages and lock their bundled skills
  for (const pkgItem of state.packageItems) {
    if (!pkgItem.checked) continue;

    const entry = state.catalog.find(
      (e) => e.type === "package" && e.name === pkgItem.label,
    );
    if (!entry || entry.type !== "package" || entry.skillPaths.length === 0) {
      continue;
    }

    for (const skillItem of state.skillItems) {
      const skillEntry = state.catalog.find(
        (e) => e.type === "skill" && e.name === skillItem.label,
      );
      if (skillEntry && entry.skillPaths.includes(skillEntry.path)) {
        skillItem.locked = true;
        skillItem.lockedBy = pkgItem.label;
        skillItem.checked = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Build items from catalog
// ---------------------------------------------------------------------------

function buildPackageItems(
  catalog: CatalogEntry[],
  installedPackages: Set<string>,
): FuzzyMultiSelectorItem[] {
  return catalog
    .filter(
      (e): e is CatalogEntry & { type: "package" } => e.type === "package",
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const skillCount = entry.skillPaths.length;
      const suffix =
        skillCount > 0
          ? `(${skillCount} skill${skillCount !== 1 ? "s" : ""})`
          : undefined;
      return {
        label: entry.name,
        description: entry.description || undefined,
        suffix,
        checked: installedPackages.has(entry.path),
      };
    });
}

function buildSkillItems(
  catalog: CatalogEntry[],
  installedSkills: Set<string>,
): FuzzyMultiSelectorItem[] {
  return catalog
    .filter((e) => e.type === "skill")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      label: entry.name,
      description: entry.description,
      checked: installedSkills.has(entry.path),
    }));
}

function buildAgentsDirItems(
  cwd: string,
  childProjects: string[],
): Array<{ path: string; checked: boolean }> {
  const items = [{ path: cwd, checked: true }];
  for (const p of childProjects) {
    // Show relative-ish label: just the last segments after cwd
    const relative = p.startsWith(cwd) ? `./${p.slice(cwd.length + 1)}` : p;
    items.push({ path: relative, checked: true });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Collect result from state
// ---------------------------------------------------------------------------

function collectResult(state: WizardState): WizardResult {
  const selectedEntries: CatalogEntry[] = [];
  const unselectedEntries: CatalogEntry[] = [];

  for (const item of state.packageItems) {
    const entry = state.catalog.find(
      (e) => e.type === "package" && e.name === item.label,
    );
    if (!entry) continue;
    if (item.checked) {
      selectedEntries.push(entry);
    } else {
      unselectedEntries.push(entry);
    }
  }

  for (const item of state.skillItems) {
    const entry = state.catalog.find(
      (e) => e.type === "skill" && e.name === item.label,
    );
    if (!entry) continue;
    if (item.checked) {
      selectedEntries.push(entry);
    } else {
      unselectedEntries.push(entry);
    }
  }

  const agentsDirs = state.agentsDirItems
    .filter((d) => d.checked)
    .map((d) => d.path);

  return {
    selectedEntries,
    unselectedEntries,
    nixChoice: state.nixChoice,
    nixHasShell: state.nixHasShell,
    nixHasFlake: state.nixHasFlake,
    generateAgents: state.generateAgents,
    agentsPrompt:
      state.agentsPrompt.trim().length > 0 ? state.agentsPrompt.trim() : null,
    agentsDirs,
    stack: state.stack,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function showWizard(
  ctx: ExtensionCommandContext,
  catalogDirs: string[],
  catalogDepth: number,
  childProjectDepth: number,
): Promise<WizardResult | null> {
  // --- Loading phase (blocking, before wizard appears) ---
  const catalog = await scanCatalog(catalogDirs, catalogDepth);
  if (catalog.length === 0) {
    ctx.ui.notify(
      "No skills or packages found in catalog directories.",
      "warning",
    );
    return null;
  }

  const stack = await scanProject(ctx.cwd);
  const settings = await readSettings(ctx.cwd);
  const installed = getInstalled(settings);
  const childProjects = findChildProjects(ctx.cwd, childProjectDepth);

  // Detect existing nix files
  const hasFlake = existsSync(resolve(ctx.cwd, "flake.nix"));
  const hasShell = existsSync(resolve(ctx.cwd, "shell.nix"));

  // --- Build shared state ---
  const state: WizardState = {
    catalog,
    stack,
    installedSkills: installed.skills,
    installedPackages: installed.packages,
    packageItems: buildPackageItems(catalog, installed.packages),
    skillItems: buildSkillItems(catalog, installed.skills),
    nixChoice: hasFlake || hasShell ? "skip" : "shell.nix",
    nixHasShell: hasShell,
    nixHasFlake: hasFlake,
    generateAgents: true,
    agentsPrompt: "",
    agentsDirItems: buildAgentsDirItems(ctx.cwd, childProjects),
  };

  // Apply initial locks
  recomputeSkillLocks(state);

  // --- Show wizard ---
  const settingsTheme = getSettingsListTheme();

  return ctx.ui.custom<WizardResult | null>((_tui, uiTheme, _kb, done) => {
    return new Wizard({
      title: `Project Init — ${stack.summary}`,
      theme: uiTheme,
      hintSuffix: `${catalog.length} items in catalog`,
      minContentHeight: 24,
      onComplete: () => done(collectResult(state)),
      onCancel: () => done(null),
      steps: [
        {
          label: "Packages",
          build: (wizardCtx) =>
            new PackagesStep(state, settingsTheme, wizardCtx),
        },
        {
          label: "Skills",
          build: (wizardCtx) => new SkillsStep(state, settingsTheme, wizardCtx),
        },
        {
          label: "Nix",
          build: (wizardCtx) => new NixStep(state, settingsTheme, wizardCtx),
        },
        {
          label: "AGENTS.md",
          build: (wizardCtx) => new AgentsStep(state, settingsTheme, wizardCtx),
        },
      ],
    });
  });
}
