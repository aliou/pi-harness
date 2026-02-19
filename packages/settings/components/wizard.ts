/**
 * A multi-step wizard component with tabbed navigation and bordered frame.
 *
 * Features:
 * - Box-drawing border around the entire wizard (╭╮╰╯ style)
 * - Step tabs at the top with progress indicators (●/○)
 * - Tab/Shift+Tab navigation between steps
 * - Each step renders its own inner Component
 * - Ctrl+S or Enter on the last step submits
 * - Esc cancels the entire wizard
 *
 * Use for first-time setup flows, multi-step configuration, or any
 * sequential data collection that benefits from back-and-forth navigation.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

export interface WizardStep {
  /** Tab label shown at the top. Keep it short (1-2 words). */
  label: string;
  /**
   * Build the inner component for this step.
   *
   * The component controls its own rendering and input handling.
   * Call `markComplete()` to mark the step as done (shows ● in tabs).
   * Call `markIncomplete()` to revert it (shows ○).
   *
   * The wizard handles borders, tabs, and step navigation externally.
   * The inner component should NOT handle Tab/Shift+Tab/Esc/Ctrl+S.
   */
  build: (ctx: WizardStepContext) => Component;
}

export interface WizardStepContext {
  /** Mark this step as complete (filled ● in progress). */
  markComplete: () => void;
  /** Mark this step as incomplete (empty ○ in progress). */
  markIncomplete: () => void;
}

export interface WizardOptions {
  /** Title shown at the top of the wizard. */
  title: string;
  /** Ordered list of steps. */
  steps: WizardStep[];
  /** Theme for rendering borders and chrome. */
  theme: Theme;
  /** Called when user submits (Ctrl+S). */
  onComplete: () => void;
  /** Called when user cancels (Esc). */
  onCancel: () => void;
  /** Hint text appended to the controls line. */
  hintSuffix?: string;
}

export class Wizard implements Component {
  private steps: WizardStep[];
  private theme: Theme;
  private onComplete: () => void;
  private onCancel: () => void;
  private title: string;
  private hintSuffix: string;

  private activeIndex = 0;
  private completed: boolean[];
  private components: Component[];

  constructor(options: WizardOptions) {
    this.steps = options.steps;
    this.theme = options.theme;
    this.onComplete = options.onComplete;
    this.onCancel = options.onCancel;
    this.title = options.title;
    this.hintSuffix = options.hintSuffix ?? "";

    this.completed = new Array(options.steps.length).fill(false) as boolean[];
    this.components = options.steps.map((step, i) =>
      step.build({
        markComplete: () => {
          this.completed[i] = true;
        },
        markIncomplete: () => {
          this.completed[i] = false;
        },
      }),
    );
  }

  /** Returns the index of the currently active step. */
  getActiveIndex(): number {
    return this.activeIndex;
  }

  /** Returns whether all steps are marked complete. */
  isAllComplete(): boolean {
    return this.completed.every(Boolean);
  }

  invalidate(): void {
    for (const component of this.components) {
      component.invalidate?.();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const t = this.theme;
    const contentWidth = Math.max(1, width - 2);

    // --- Top border with title ---
    const titleText = ` ${this.title} `;
    const titleLen = visibleWidth(titleText);
    const topRuleLen = Math.max(1, width - titleLen - 3);
    lines.push(
      t.fg("border", "╭─") +
        t.fg("accent", t.bold(titleText)) +
        t.fg("border", "─".repeat(topRuleLen)) +
        t.fg("border", "╮"),
    );

    // --- Step tabs with progress ---
    const tabLine = this.renderStepTabs(contentWidth);
    lines.push(this.padLine(tabLine, contentWidth));
    lines.push(this.padLine("", contentWidth));

    // --- Inner component ---
    const innerComponent = this.components[this.activeIndex];
    if (innerComponent) {
      const innerLines = innerComponent.render(contentWidth);
      for (const line of innerLines) {
        lines.push(this.padLine(line, contentWidth));
      }
    }

    // --- Separator ---
    lines.push(
      t.fg("border", "├") +
        t.fg("border", "─".repeat(contentWidth)) +
        t.fg("border", "┤"),
    );

    // --- Controls ---
    const controlsText = this.buildControlsText();
    lines.push(this.padLine(controlsText, contentWidth));

    // --- Bottom border ---
    lines.push(
      t.fg("border", "╰") +
        t.fg("border", "─".repeat(contentWidth)) +
        t.fg("border", "╯"),
    );

    return lines;
  }

  handleInput(data: string): void {
    // Ctrl+S: submit if all steps complete
    if (matchesKey(data, Key.ctrl("s"))) {
      this.onComplete();
      return;
    }

    // Esc: cancel
    if (matchesKey(data, Key.escape)) {
      this.onCancel();
      return;
    }

    // Tab / Shift+Tab: navigate steps
    if (matchesKey(data, Key.tab)) {
      this.activeIndex = (this.activeIndex + 1) % this.steps.length;
      return;
    }
    if (matchesKey(data, Key.shift("tab"))) {
      this.activeIndex =
        (this.activeIndex - 1 + this.steps.length) % this.steps.length;
      return;
    }

    // Delegate to inner component
    const innerComponent = this.components[this.activeIndex];
    innerComponent?.handleInput?.(data);
  }

  // --- Private rendering helpers ---

  private renderStepTabs(_contentWidth: number): string {
    const t = this.theme;
    const parts: string[] = [];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) continue;

      const dot = this.completed[i]
        ? t.fg("success", "●")
        : i === this.activeIndex
          ? t.fg("accent", "●")
          : t.fg("dim", "○");

      const label =
        i === this.activeIndex
          ? t.bg("selectedBg", t.fg("accent", ` ${step.label} `))
          : t.fg("dim", ` ${step.label} `);

      parts.push(`${dot} ${label}`);
    }

    return parts.join("  ");
  }

  private padLine(content: string, contentWidth: number): string {
    const t = this.theme;
    const len = visibleWidth(content);
    const padding = Math.max(0, contentWidth - len);
    return (
      t.fg("border", "│") +
      truncateToWidth(content, contentWidth) +
      " ".repeat(padding) +
      t.fg("border", "│")
    );
  }

  private buildControlsText(): string {
    const t = this.theme;
    const parts: string[] = [
      "Tab/Shift+Tab navigate",
      "Ctrl+S submit",
      "Esc cancel",
    ];
    if (this.hintSuffix) {
      parts.push(this.hintSuffix);
    }
    return t.fg("dim", ` ${parts.join(" · ")}`);
  }
}
