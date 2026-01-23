import { createThemedBoxRenderer } from "@aliou/tui-utils";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  getEditorKeybindings,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
import type { PlanInfo } from "./types";

export interface PlanSelectorOptions {
  title: string;
  plans: PlanInfo[];
}

export interface PlanSelectorResult {
  selected: PlanInfo | null;
}

type StatusFilter =
  | "all"
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "abandoned"
  | "missing";

type SortMode = "date-desc" | "date-asc" | "title-asc" | "title-desc";

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
  status: StatusFilter;
  count: number;
}

type FlatItem = FlatNodeItem | FlatGroupItem;

export function createPlanSelector(
  options: PlanSelectorOptions,
  done: (result: PlanSelectorResult) => void,
  theme: Theme,
  tui: { requestRender: () => void },
): Component {
  return new PlanSelector(tui, theme, options, done);
}

export async function selectPlan(
  ctx: ExtensionContext,
  plans: PlanInfo[],
  title: string,
): Promise<PlanInfo | null> {
  if (!ctx.hasUI) return null;

  const result = await ctx.ui.custom<PlanSelectorResult>(
    (tui, theme, _keybindings, done) =>
      createPlanSelector({ title, plans }, done, theme, tui),
    {
      overlay: true,
      overlayOptions: () => buildOverlayOptions(),
    },
  );

  return result?.selected ?? null;
}

class PlanSelector implements Component {
  private closed = false;
  private sortMode: SortMode = "date-desc";
  private filterMode: StatusFilter = "all";
  private groupByStatus = false;
  private flatItems: FlatItem[] = [];
  private selectableNodes: PlanTreeNode[] = [];
  private selectedIndex = 0;
  private selectedId: string | null = null;
  private scrollOffset = 0;
  private readonly roots: PlanTreeNode[];

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: Theme,
    private readonly options: PlanSelectorOptions,
    private readonly done: (result: PlanSelectorResult) => void,
  ) {
    this.roots = buildPlanForest(options.plans);
    this.refreshView();
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectUp") || data === "k") {
      this.moveSelection(-1);
      return;
    }

    if (kb.matches(data, "selectDown") || data === "j") {
      this.moveSelection(1);
      return;
    }

    if (kb.matches(data, "cursorLeft")) {
      this.moveSelection(-Math.max(1, this.visibleLines()));
      return;
    }

    if (kb.matches(data, "cursorRight")) {
      this.moveSelection(Math.max(1, this.visibleLines()));
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

    if (matchesKey(data, "ctrl+d")) {
      this.sortMode = "date-desc";
      this.filterMode = "all";
      this.groupByStatus = false;
      this.refreshView();
      return;
    }

    if (matchesKey(data, "ctrl+o")) {
      this.filterMode = nextFilterMode(this.filterMode, true);
      this.refreshView();
      return;
    }

    if (matchesKey(data, "shift+ctrl+o")) {
      this.filterMode = nextFilterMode(this.filterMode, false);
      this.refreshView();
      return;
    }

    if (matchesKey(data, "ctrl+u")) {
      this.sortMode = nextSortMode(this.sortMode, true);
      this.refreshView();
      return;
    }

    if (matchesKey(data, "shift+ctrl+u")) {
      this.sortMode = nextSortMode(this.sortMode, false);
      this.refreshView();
      return;
    }

    if (matchesKey(data, "ctrl+t")) {
      this.groupByStatus = !this.groupByStatus;
      this.refreshView();
      return;
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const box = createThemedBoxRenderer(width, this.theme, {
      leadingSpace: true,
      trailingSpace: true,
    });

    lines.push(
      box.padLine(
        box.topWithTitle("Plans", (s: string) =>
          this.theme.fg("accent", this.theme.bold(s)),
        ),
      ),
    );

    lines.push(
      box.padLine(
        box.row(
          truncateToWidth(
            this.theme.bold(this.options.title),
            box.innerWidth,
            "",
          ),
        ),
      ),
    );

    lines.push(
      box.padLine(
        box.row(
          truncateToWidth(
            this.theme.fg(
              "dim",
              `Sort: ${formatSortMode(this.sortMode)}  Filter: ${formatFilterMode(this.filterMode)}  Group: ${this.groupByStatus ? "on" : "off"}`,
            ),
            box.innerWidth,
            "",
          ),
        ),
      ),
    );

    lines.push(box.padLine(box.divider()));

    const visibleCount = this.visibleLines();
    const sliceStart = Math.min(
      this.scrollOffset,
      Math.max(0, this.flatItems.length - visibleCount),
    );
    const sliceEnd = sliceStart + visibleCount;
    const visibleItems = this.flatItems.slice(sliceStart, sliceEnd);

    let renderedCount = 0;

    if (this.flatItems.length === 0) {
      lines.push(
        box.padLine(
          box.row(this.theme.fg("dim", "No plans match the current filter")),
        ),
      );
      renderedCount = 1;
    } else {
      for (const item of visibleItems) {
        if (item.type === "group") {
          lines.push(
            box.padLine(box.row(this.renderGroupLine(item, box.innerWidth))),
          );
        } else {
          const isSelected = this.isSelected(item.node);
          lines.push(
            box.padLine(
              box.row(this.renderPlanLine(item, box.innerWidth, isSelected)),
            ),
          );
        }
        renderedCount += 1;
      }
    }

    for (let i = renderedCount; i < visibleCount; i++) {
      lines.push(box.padLine(box.empty()));
    }

    lines.push(box.padLine(box.divider()));
    lines.push(
      box.padLine(
        box.row(
          truncateToWidth(
            this.theme.fg(
              "dim",
              "↑/↓ move  ←/→ page  Enter select  Esc cancel  Ctrl+O filter  Ctrl+U sort  Ctrl+T group  Ctrl+D reset",
            ),
            box.innerWidth,
            "",
          ),
        ),
      ),
    );
    lines.push(box.padLine(box.bottom()));

    return lines;
  }

  invalidate(): void {}

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
    const status = getNodeStatus(item.node);
    const statusLabel = formatStatusLabel(status);
    const statusDisplay = this.styleStatus(statusLabel, status);
    const statusWidth = visibleWidth(statusLabel);

    const leftBase = `${prefix}${treePrefix}${date}  ${title}`;
    const leftWidth = Math.max(0, width - statusWidth - 1);
    const left = truncateToWidth(leftBase, leftWidth, "...");

    return `${left} ${statusDisplay}`;
  }

  private styleStatus(value: string, status: StatusFilter): string {
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
    const rows = process.stdout.rows ?? 24;
    const available = rows - 12;
    return Math.max(3, Math.min(10, available));
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
    const viewRoots = buildViewForest(
      this.roots,
      this.sortMode,
      this.filterMode,
    );
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

function buildOverlayOptions() {
  const termWidth = process.stdout.columns ?? 120;
  const termHeight = process.stdout.rows ?? 40;
  const isNarrow = termWidth < 90 || termHeight < 20;

  if (isNarrow) {
    return {
      anchor: "top-center" as const,
      width: "100%" as const,
      maxHeight: "100%" as const,
      margin: 0,
    };
  }

  return {
    anchor: "top-center" as const,
    width: "90%" as const,
    minWidth: 70,
    maxHeight: "80%" as const,
    margin: { top: 1, left: 2, right: 2, bottom: 1 },
  };
}

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
  filterMode: StatusFilter,
): ViewNode[] {
  const sortedRoots = sortNodes(roots, sortMode);
  const result: ViewNode[] = [];

  for (const node of sortedRoots) {
    const viewChildren = buildViewForest(node.children, sortMode, filterMode);
    const matches = filterMode === "all" || getNodeStatus(node) === filterMode;

    if (matches) {
      result.push({ node, children: viewChildren });
    } else {
      result.push(...viewChildren);
    }
  }

  return result;
}

function buildGroupedView(viewRoots: ViewNode[], sortMode: SortMode) {
  const groups = new Map<StatusFilter, ViewNode[]>();

  for (const root of viewRoots) {
    const status = getNodeStatus(root.node);
    if (!groups.has(status)) {
      groups.set(status, []);
    }
    groups.get(status)?.push(root);
  }

  const orderedStatuses = getStatusOrder();
  const result: {
    type: "group";
    status: StatusFilter;
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
  const sorted = nodes;

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    if (!node) continue;
    const isLast = i === sorted.length - 1;
    items.push({
      type: "node",
      node: node.node,
      ancestors,
      isLast,
    });

    const nextAncestors = [...ancestors, isLast];
    if (node.children.length > 0) {
      items.push(...flattenViewNodes(node.children, nextAncestors));
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

function getNodeStatus(node: PlanTreeNode): StatusFilter {
  if (node.missing) return "missing";
  const status = node.plan?.status ?? "pending";
  return status;
}

function formatStatusLabel(status: StatusFilter): string {
  if (status === "all") return "all";
  if (status === "in-progress") return "in-progress";
  return status;
}

function formatSortMode(mode: SortMode): string {
  switch (mode) {
    case "date-asc":
      return "date asc";
    case "date-desc":
      return "date desc";
    case "title-asc":
      return "title asc";
    case "title-desc":
      return "title desc";
    default:
      return mode;
  }
}

function formatFilterMode(mode: StatusFilter): string {
  if (mode === "all") return "all";
  return mode;
}

function nextSortMode(current: SortMode, forward: boolean): SortMode {
  const modes: SortMode[] = [
    "date-desc",
    "date-asc",
    "title-asc",
    "title-desc",
  ];
  const index = modes.indexOf(current);
  const nextIndex = forward
    ? (index + 1) % modes.length
    : (index - 1 + modes.length) % modes.length;
  return modes[nextIndex] ?? "date-desc";
}

function nextFilterMode(current: StatusFilter, forward: boolean): StatusFilter {
  const modes: StatusFilter[] = [
    "all",
    "pending",
    "in-progress",
    "completed",
    "cancelled",
    "abandoned",
    "missing",
  ];
  const index = modes.indexOf(current);
  const nextIndex = forward
    ? (index + 1) % modes.length
    : (index - 1 + modes.length) % modes.length;
  return modes[nextIndex] ?? "all";
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
  const titleA = getNodeTitle(a).toLowerCase();
  const titleB = getNodeTitle(b).toLowerCase();
  const dateA = a.plan?.date || "";
  const dateB = b.plan?.date || "";

  switch (sortMode) {
    case "date-asc":
      return dateA.localeCompare(dateB) || titleA.localeCompare(titleB);
    case "date-desc":
      return dateB.localeCompare(dateA) || titleA.localeCompare(titleB);
    case "title-desc":
      return titleB.localeCompare(titleA);
    case "title-asc":
    default:
      return titleA.localeCompare(titleB);
  }
}

function getStatusOrder(): StatusFilter[] {
  return [
    "in-progress",
    "pending",
    "completed",
    "cancelled",
    "abandoned",
    "missing",
  ];
}
