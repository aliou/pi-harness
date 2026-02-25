/**
 * Update selector UI component.
 *
 * Shows a loader while checking for updates, then a FuzzyMultiSelector to
 * pick which updates to apply. Uses Container-based composition like the
 * handoff command does.
 */

import {
  FuzzyMultiSelector,
  type FuzzyMultiSelectorItem,
} from "@aliou/pi-utils-settings";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  DynamicBorder,
  getSettingsListTheme,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  Loader,
  matchesKey,
  Spacer,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
import type { PackageUpdate } from "../lib/update";
import { checkForUpdates } from "../lib/update";

export interface UpdateSelectorResult {
  selected: PackageUpdate[];
  confirmed: boolean;
}

/**
 * Container that shows a loader while checking for updates, then swaps in a
 * FuzzyMultiSelector when results are ready.
 */
class UpdateView extends Container {
  private loader: Loader;
  private borderTop: DynamicBorder;
  private borderBottom: DynamicBorder;
  private selector: FuzzyMultiSelector | null = null;
  private statusText: Text;
  private updates: PackageUpdate[] = [];
  private abortController = new AbortController();
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  onDone: ((result: UpdateSelectorResult) => void) | undefined;

  constructor(
    tui: TUI,
    private theme: Theme,
  ) {
    super();

    const borderColor = (s: string) => theme.fg("border", s);
    this.borderTop = new DynamicBorder(borderColor);
    this.borderBottom = new DynamicBorder(borderColor);

    this.loader = new Loader(
      tui,
      (s: string) => theme.fg("accent", s),
      (s: string) => theme.fg("muted", s),
      "Checking for updates...",
    );
    this.loader.start();

    this.statusText = new Text("", 0, 0);

    this.buildLoaderLayout();

    // Start async check after a tick so the loader renders first.
    setImmediate(() => this.check());
  }

  private buildLoaderLayout(): void {
    this.clear();
    this.addChild(this.borderTop);
    this.addChild(this.loader);
    this.addChild(new Text(this.theme.fg("dim", "  Esc to cancel"), 0, 0));
    this.addChild(this.borderBottom);
  }

  private buildSelectorLayout(): void {
    this.clear();
    this.addChild(this.borderTop);
    if (this.selector) this.addChild(this.selector);
    this.addChild(this.statusText);
    this.addChild(new Spacer(1));
    this.addChild(this.borderBottom);
  }

  private async check(): Promise<void> {
    const result = await checkForUpdates();

    if (this.abortController.signal.aborted) return;

    if (result.errors.length > 0) {
      this.finish(result.errors.join(", "), false);
      return;
    }

    if (result.updates.length === 0) {
      this.finish("All packages are up to date.", false);
      return;
    }

    this.updates = result.updates;
    this.showSelector(result.updates, result.skipped);
  }

  private showSelector(updates: PackageUpdate[], skipped: string[]): void {
    this.loader.stop();

    const items: FuzzyMultiSelectorItem[] = updates.map((u) => {
      const name = u.id.replace(/^(npm:|git:)/, "");
      const typeLabel = u.type === "npm" ? "npm" : "git";
      const versionChange = `${u.fromVersion} -> ${u.toVersion}`;
      return {
        label: name,
        description: `${typeLabel}: ${versionChange}`,
        checked: true,
      };
    });

    const settingsTheme = getSettingsListTheme();

    this.selector = new FuzzyMultiSelector({
      label: "Select updates to apply",
      items,
      theme: settingsTheme,
      maxVisible: 15,
    });

    const skippedCount = skipped.length;
    if (skippedCount > 0) {
      this.statusText = new Text(
        this.theme.fg("dim", `  ${skippedCount} packages already up to date`),
        1,
        0,
      );
    }

    this.buildSelectorLayout();
    this.invalidate();
  }

  private finish(message: string, confirmed: boolean): void {
    this.loader.stop();
    if (message) {
      this.loader.setMessage(message);
    }
    // Brief delay so user can see the message before closing.
    this.pendingTimeout = setTimeout(
      () => {
        this.pendingTimeout = null;
        this.onDone?.({
          selected: confirmed ? this.getSelectedUpdates() : [],
          confirmed,
        });
      },
      confirmed ? 0 : 800,
    );
  }

  private getSelectedUpdates(): PackageUpdate[] {
    if (!this.selector) return [];
    const checkedLabels = new Set(
      this.selector.getCheckedItems().map((i) => i.label),
    );
    return this.updates.filter((u) => {
      const name = u.id.replace(/^(npm:|git:)/, "");
      return checkedLabels.has(name);
    });
  }

  handleInput(data: string): void {
    // Cancel at any point.
    if (matchesKey(data, Key.escape)) {
      this.abortController.abort();
      this.onDone?.({ selected: [], confirmed: false });
      return;
    }

    // Confirm selection.
    if (this.selector && matchesKey(data, Key.enter)) {
      const selected = this.getSelectedUpdates();
      if (selected.length === 0) {
        // Don't confirm with nothing selected -- just flash a message.
        this.statusText = new Text(
          this.theme.fg(
            "warning",
            "  No updates selected. Press Esc to cancel.",
          ),
          1,
          0,
        );
        this.buildSelectorLayout();
        this.invalidate();
        return;
      }
      this.onDone?.({ selected, confirmed: true });
      return;
    }

    // Forward to selector.
    if (this.selector) {
      this.selector.handleInput(data);
      this.invalidate();
    }
  }

  dispose(): void {
    this.loader.stop();
    this.abortController.abort();
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
  }
}

export async function selectUpdates(
  ctx: ExtensionContext,
): Promise<UpdateSelectorResult | undefined> {
  if (!ctx.hasUI) return undefined;

  return ctx.ui.custom<UpdateSelectorResult>((tui, theme, _kb, done) => {
    const view = new UpdateView(tui, theme);
    view.onDone = done;
    return view;
  });
}
