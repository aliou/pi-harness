import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  getEditorKeybindings,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
import type { PlanInfo } from "./types";

export interface ArchiveResult {
  ok: boolean;
  message: string;
}

export interface PlanSelectorOptions {
  plans: PlanInfo[];
  onArchive?: (plan: PlanInfo) => Promise<ArchiveResult>;
}

export interface PlanSelectorResult {
  selected: PlanInfo | null;
}

export async function selectPlan(
  ctx: ExtensionContext,
  plans: PlanInfo[],
  onArchive?: (plan: PlanInfo) => Promise<ArchiveResult>,
): Promise<PlanInfo | null> {
  if (!ctx.hasUI) return null;

  const result = await ctx.ui.custom<PlanSelectorResult>(
    (tui, theme, _keybindings, done) =>
      new PlanSelector(tui, theme, { plans, onArchive }, done),
  );

  // RPC fallback: use select dialog
  if (result === undefined) {
    const planLabels = plans.map(
      (p) => `${p.date || "????"} ${p.title?.trim() || p.slug}`,
    );
    const selected = await ctx.ui.select("Select plan", planLabels);
    if (selected) {
      const index = planLabels.indexOf(selected);
      return plans[index] ?? null;
    }
    return null;
  }

  return result?.selected ?? null;
}

type SortMode = "date-desc" | "date-asc";

interface PlanTreeNode {
  id: string;
  slug: string;
  plan?: PlanInfo;
  missing: boolean;
  children: PlanTreeNode[];
  parents: Set<string>;
}

interface ViewNode {
  node: PlanTreeNode;
  children: ViewNode[];
}

interface FlatNodeItem {
  type: "node";
  node: PlanTreeNode;
  ancestors: boolean[];
  isLast: boolean;
}

interface FlatGroupItem {
  type: "group";
  label: string;
  status: string;
  count: number;
}

type FlatItem = FlatNodeItem | FlatGroupItem;

type StatusMessage = {
  text: string;
  level: "info" | "error" | "progress";
};

class PlanSelector implements Component {
  private closed = false;
  private sortMode: SortMode = "date-desc";
  private groupByStatus = false;
  private flatItems: FlatItem[] = [];
  private selectableNodes: PlanTreeNode[] = [];
  private selectedIndex = 0;
  private selectedId: string | null = null;
  private scrollOffset = 0;
  private roots: PlanTreeNode[];
  private plans: PlanInfo[];
  private archiving = false;
  private statusMessage: StatusMessage | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: Theme,
    private readonly options: PlanSelectorOptions,
    private readonly done: (result: PlanSelectorResult) => void,
  ) {
    this.plans = [...options.plans];
    this.roots = buildPlanForest(this.plans);
    this.refreshView();
  }

  handleInput(data: string): void {
    // Block all input while archiving
    if (this.archiving) return;

    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectUp") || data === "k") {
      this.moveSelection(-1);
      return;
    }

    if (kb.matches(data, "selectDown") || data === "j") {
      this.moveSelection(1);
      return;
    }

    if (kb.matches(data, "selectConfirm")) {
      const selected = this.selectableNodes[this.selectedIndex];
      if (selected?.plan) {
        this.finish({ selected: selected.plan });
      }
      return;
    }

    if (kb.matches(data, "selectCancel")) {
      this.finish({ selected: null });
      return;
    }

    // Archive: Ctrl+A
    if (matchesKey(data, "ctrl+a")) {
      const selected = this.selectableNodes[this.selectedIndex];
      if (selected?.plan) {
        this.startArchive(selected.plan);
      }
      return;
    }

    // Toggle sort: Ctrl+U
    if (matchesKey(data, "ctrl+u")) {
      this.sortMode = this.sortMode === "date-desc" ? "date-asc" : "date-desc";
      this.refreshView();
      return;
    }

    // Toggle group by status: Ctrl+T
    if (matchesKey(data, "ctrl+t")) {
      this.groupByStatus = !this.groupByStatus;
      this.refreshView();
      return;
    }
  }

  render(width: number): string[] {
    const theme = this.theme;
    const dim = (s: string) => theme.fg("dim", s);
    const accent = (s: string) => theme.fg("accent", s);
    const bold = (s: string) => theme.bold(s);
    const border = (s: string) => theme.fg("dim", s);

    const lines: string[] = [];
    const innerWidth = width - 2;

    const padLine = (content: string): string => {
      const len = visibleWidth(content);
      return ` ${content}${" ".repeat(Math.max(0, innerWidth - len))} `;
    };

    // Top border with title
    const title = " Plans ";
    const titleLen = title.length;
    const borderLen = Math.max(0, width - titleLen);
    const leftBorder = Math.floor(borderLen / 2);
    const rightBorder = borderLen - leftBorder;
    lines.push(
      border("─".repeat(leftBorder)) +
        accent(bold(title)) +
        border("─".repeat(rightBorder)),
    );

    // Status line: sort/group info, or status message
    if (this.statusMessage) {
      const style =
        this.statusMessage.level === "error"
          ? (s: string) => theme.fg("error", s)
          : this.statusMessage.level === "progress"
            ? (s: string) => theme.fg("warning", s)
            : (s: string) => theme.fg("accent", s);
      lines.push(
        padLine(
          style(truncateToWidth(this.statusMessage.text, innerWidth, "")),
        ),
      );
    } else {
      const sortLabel =
        this.sortMode === "date-desc" ? "newest first" : "oldest first";
      const groupLabel = this.groupByStatus ? "on" : "off";
      lines.push(
        padLine(
          dim(
            truncateToWidth(
              `Sort: ${sortLabel}  Group: ${groupLabel}`,
              innerWidth,
              "",
            ),
          ),
        ),
      );
    }

    lines.push(border("─".repeat(width)));

    const visibleCount = this.visibleLines();
    const sliceStart = Math.min(
      this.scrollOffset,
      Math.max(0, this.flatItems.length - visibleCount),
    );
    const sliceEnd = sliceStart + visibleCount;
    const visibleItems = this.flatItems.slice(sliceStart, sliceEnd);

    let renderedCount = 0;

    if (this.flatItems.length === 0) {
      lines.push(padLine(dim("No plans")));
      renderedCount = 1;
    } else {
      for (const item of visibleItems) {
        if (item.type === "group") {
          lines.push(padLine(this.renderGroupLine(item, innerWidth)));
        } else {
          const isSelected = this.isSelected(item.node);
          lines.push(
            padLine(this.renderPlanLine(item, innerWidth, isSelected)),
          );
        }
        renderedCount++;
      }
    }

    for (let i = renderedCount; i < visibleCount; i++) {
      lines.push(padLine(""));
    }

    lines.push(border("─".repeat(width)));
    lines.push(
      padLine(
        dim(
          truncateToWidth(
            "↑/↓ move  Enter select  Ctrl+A archive  Ctrl+U sort  Ctrl+T group  Esc cancel",
            innerWidth,
            "",
          ),
        ),
      ),
    );
    lines.push(border("─".repeat(width)));

    return lines;
  }

  invalidate(): void {}

  private startArchive(plan: PlanInfo): void {
    if (!this.options.onArchive) {
      this.showStatus("Archive not configured", "error");
      return;
    }

    this.archiving = true;
    const title = plan.title?.trim() || plan.slug || plan.filename;
    this.showStatus(`Archiving ${title}...`, "progress");

    this.options
      .onArchive(plan)
      .then((result) => {
        this.archiving = false;

        if (result.ok) {
          // Remove the archived plan and rebuild the tree
          this.plans = this.plans.filter((p) => p.slug !== plan.slug);
          this.roots = buildPlanForest(this.plans);
          this.refreshView();
          this.showStatus(result.message, "info");
        } else {
          this.showStatus(result.message, "error");
        }
      })
      .catch((err) => {
        this.archiving = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.showStatus(`Archive failed: ${msg}`, "error");
      });
  }

  private showStatus(text: string, level: StatusMessage["level"]): void {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }

    this.statusMessage = { text, level };
    this.tui.requestRender();

    // Auto-clear non-progress messages after 3 seconds
    if (level !== "progress") {
      this.statusTimer = setTimeout(() => {
        this.statusMessage = null;
        this.statusTimer = null;
        this.tui.requestRender();
      }, 3000);
    }
  }

  private renderGroupLine(item: FlatGroupItem, width: number): string {
    const label = `${item.label} (${item.count})`;
    const styled = this.styleStatus(label, item.status);
    return truncateToWidth(styled, width, "");
  }

  private renderPlanLine(
    item: FlatNodeItem,
    width: number,
    selected: boolean,
  ): string {
    const prefix = selected ? `${this.theme.fg("accent", "▶")} ` : "  ";
    const treePrefix = buildTreePrefix(
      item.ancestors,
      item.isLast,
      item.ancestors.length > 0,
    );
    const date = item.node.plan?.date || "????-??-??";
    const title = getNodeTitle(item.node);
    const status = item.node.plan?.status ?? "pending";
    const statusLabel = formatStatusLabel(status);
    const statusDisplay = this.styleStatus(statusLabel, status);
    const statusWidth = visibleWidth(statusLabel);

    const leftBase = `${prefix}${treePrefix}${date}  ${title}`;
    const leftWidth = Math.max(0, width - statusWidth - 1);
    const left = truncateToWidth(leftBase, leftWidth, "...");

    return `${left} ${statusDisplay}`;
  }

  private styleStatus(value: string, status: string): string {
    switch (status) {
      case "completed":
        return this.theme.fg("success", value);
      case "in-progress":
        return this.theme.fg("warning", value);
      case "pending":
        return this.theme.fg("dim", value);
      case "cancelled":
      case "abandoned":
      case "missing":
        return this.theme.fg("error", value);
      default:
        return this.theme.fg("dim", value);
    }
  }

  private visibleLines(): number {
    return 10;
  }

  private moveSelection(delta: number): void {
    if (this.selectableNodes.length === 0) return;
    const max = this.selectableNodes.length - 1;
    const next = Math.min(max, Math.max(0, this.selectedIndex + delta));
    this.selectedIndex = next;
    const selected = this.selectableNodes[this.selectedIndex];
    this.selectedId = selected?.id ?? null;
    this.ensureScrollVisible();
    this.tui.requestRender();
  }

  private refreshView(): void {
    const viewRoots = buildViewForest(this.roots, this.sortMode);
    const grouped = this.groupByStatus
      ? buildGroupedView(viewRoots, this.sortMode)
      : viewRoots.map((node) => ({ type: "node" as const, node }));

    const flatItems: FlatItem[] = [];
    for (const entry of grouped) {
      if (entry.type === "group") {
        flatItems.push(entry);
        flatItems.push(...flattenViewNodes(entry.nodes, []));
      } else {
        flatItems.push(...flattenViewNodes([entry.node], []));
      }
    }

    this.flatItems = flatItems;
    this.selectableNodes = flatItems
      .filter((item): item is FlatNodeItem => item.type === "node")
      .map((item) => item.node)
      .filter((node) => !node.missing && node.plan !== undefined);

    if (this.selectedId) {
      const idx = this.selectableNodes.findIndex(
        (node) => node.id === this.selectedId,
      );
      if (idx >= 0) {
        this.selectedIndex = idx;
      } else {
        this.selectedIndex = 0;
      }
    } else {
      this.selectedIndex = 0;
    }

    const selected = this.selectableNodes[this.selectedIndex];
    this.selectedId = selected?.id ?? null;
    this.ensureScrollVisible();
    this.tui.requestRender();
  }

  private isSelected(node: PlanTreeNode): boolean {
    return this.selectedId === node.id;
  }

  private ensureScrollVisible(): void {
    const visibleCount = this.visibleLines();
    const selectedFlatIndex = this.getSelectedFlatIndex();
    const maxOffset = Math.max(0, this.flatItems.length - visibleCount);

    if (selectedFlatIndex === -1) {
      this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
      return;
    }

    if (selectedFlatIndex < this.scrollOffset) {
      this.scrollOffset = selectedFlatIndex;
    } else if (selectedFlatIndex >= this.scrollOffset + visibleCount) {
      this.scrollOffset = selectedFlatIndex - visibleCount + 1;
    }

    this.scrollOffset = Math.min(maxOffset, Math.max(0, this.scrollOffset));
  }

  private getSelectedFlatIndex(): number {
    if (!this.selectedId) return -1;
    return this.flatItems.findIndex(
      (item) => item.type === "node" && item.node.id === this.selectedId,
    );
  }

  private finish(result: PlanSelectorResult): void {
    if (this.closed) return;
    this.closed = true;
    this.done(result);
  }
}

// --- Tree building ---

function buildPlanForest(plans: PlanInfo[]): PlanTreeNode[] {
  const nodes = new Map<string, PlanTreeNode>();

  for (const plan of plans) {
    nodes.set(plan.slug, {
      id: plan.slug,
      slug: plan.slug,
      plan,
      missing: false,
      children: [],
      parents: new Set(),
    });
  }

  const getOrCreateMissing = (slug: string) => {
    const existing = nodes.get(slug);
    if (existing) return existing;
    const missingNode: PlanTreeNode = {
      id: `missing:${slug}`,
      slug,
      missing: true,
      children: [],
      parents: new Set(),
    };
    nodes.set(slug, missingNode);
    return missingNode;
  };

  for (const plan of plans) {
    const current = nodes.get(plan.slug);
    if (!current) continue;

    for (const depSlug of plan.dependencies) {
      const parent = nodes.get(depSlug) ?? getOrCreateMissing(depSlug);
      parent.children.push(current);
      current.parents.add(parent.id);
    }
  }

  return Array.from(nodes.values()).filter((node) => node.parents.size === 0);
}

function buildViewForest(
  roots: PlanTreeNode[],
  sortMode: SortMode,
): ViewNode[] {
  const sortedRoots = sortNodes(roots, sortMode);
  const result: ViewNode[] = [];

  for (const node of sortedRoots) {
    const viewChildren = buildViewForest(node.children, sortMode);
    result.push({ node, children: viewChildren });
  }

  return result;
}

function buildGroupedView(viewRoots: ViewNode[], sortMode: SortMode) {
  const groups = new Map<string, ViewNode[]>();

  for (const root of viewRoots) {
    const status = root.node.plan?.status ?? "pending";
    if (!groups.has(status)) {
      groups.set(status, []);
    }
    groups.get(status)?.push(root);
  }

  const orderedStatuses = [
    "in-progress",
    "pending",
    "completed",
    "cancelled",
    "abandoned",
    "missing",
  ];
  const result: {
    type: "group";
    status: string;
    label: string;
    count: number;
    nodes: ViewNode[];
  }[] = [];

  for (const status of orderedStatuses) {
    const nodes = groups.get(status);
    if (!nodes || nodes.length === 0) continue;
    const sorted = sortViewNodes(nodes, sortMode);
    result.push({
      type: "group",
      status,
      label: formatStatusLabel(status),
      count: sorted.length,
      nodes: sorted,
    });
  }

  return result;
}

function flattenViewNodes(
  nodes: ViewNode[],
  ancestors: boolean[],
): FlatNodeItem[] {
  const items: FlatNodeItem[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const isLast = i === nodes.length - 1;
    items.push({
      type: "node",
      node: node.node,
      ancestors,
      isLast,
    });

    if (node.children.length > 0) {
      items.push(...flattenViewNodes(node.children, [...ancestors, isLast]));
    }
  }

  return items;
}

function buildTreePrefix(
  ancestors: boolean[],
  isLast: boolean,
  hasParent: boolean,
): string {
  let prefix = "";
  for (const ancestorIsLast of ancestors) {
    prefix += ancestorIsLast ? "  " : "│ ";
  }
  if (hasParent) {
    prefix += isLast ? "└─ " : "├─ ";
  }
  return prefix;
}

function getNodeTitle(node: PlanTreeNode): string {
  if (node.plan?.title) return node.plan.title.trim();
  if (node.plan?.slug) return node.plan.slug;
  if (node.slug) return node.slug;
  return "(untitled)";
}

function formatStatusLabel(status: string): string {
  return status;
}

function sortViewNodes(nodes: ViewNode[], sortMode: SortMode): ViewNode[] {
  const sorted = [...nodes];
  sorted.sort((a, b) => compareNodes(a.node, b.node, sortMode));
  return sorted;
}

function sortNodes(nodes: PlanTreeNode[], sortMode: SortMode): PlanTreeNode[] {
  const sorted = [...nodes];
  sorted.sort((a, b) => compareNodes(a, b, sortMode));
  return sorted;
}

function compareNodes(
  a: PlanTreeNode,
  b: PlanTreeNode,
  sortMode: SortMode,
): number {
  const dateA = a.plan?.date || "";
  const dateB = b.plan?.date || "";
  if (sortMode === "date-asc") {
    return dateA.localeCompare(dateB);
  }
  return dateB.localeCompare(dateA);
}
