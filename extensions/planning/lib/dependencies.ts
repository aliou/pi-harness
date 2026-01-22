/**
 * Dependency graph logic
 */

import type { DependencyCheckResult, DependencyNode, PlanInfo } from "./types";

/**
 * Derive slug from filename
 * Example: "2026-01-22-phase-1-auth.md" -> "phase-1-auth"
 */
export function deriveSlug(filename: string): string {
  // Remove .md extension
  let slug = filename.replace(/\.md$/, "");

  // Remove date prefix (YYYY-MM-DD-)
  slug = slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  return slug;
}

/**
 * Find plan by slug
 */
export function getPlanBySlug(
  plans: PlanInfo[],
  slug: string,
): PlanInfo | undefined {
  return plans.find((p) => p.slug === slug);
}

/**
 * Check if dependencies are resolved (exist and completed)
 */
export function checkDependencies(
  plan: PlanInfo,
  allPlans: PlanInfo[],
): DependencyCheckResult {
  const resolved: PlanInfo[] = [];
  const unresolved: string[] = [];

  for (const depSlug of plan.dependencies) {
    const dep = getPlanBySlug(allPlans, depSlug);

    if (!dep) {
      unresolved.push(`${depSlug} (not found)`);
    } else if (dep.status !== "completed") {
      unresolved.push(`${depSlug} (${dep.status})`);
    } else {
      resolved.push(dep);
    }
  }

  return { resolved, unresolved };
}

/**
 * Build dependency tree (forest of roots)
 * Returns plans with no dependencies as roots, with their dependent children
 */
export function buildDependencyTree(plans: PlanInfo[]): DependencyNode[] {
  const roots: DependencyNode[] = [];
  const nodeMap = new Map<string, DependencyNode>();

  // Create nodes for all plans
  for (const plan of plans) {
    nodeMap.set(plan.slug, { plan, children: [] });
  }

  // Build parent-child relationships
  for (const plan of plans) {
    const node = nodeMap.get(plan.slug);
    if (!node) continue;

    if (plan.dependencies.length === 0) {
      // Root node
      roots.push(node);
    }

    // Add this node as child to all its dependencies
    for (const depSlug of plan.dependencies) {
      const parentNode = nodeMap.get(depSlug);
      if (parentNode) {
        parentNode.children.push(node);
      }
    }
  }

  return roots;
}

/**
 * Format dependency tree for display
 * Returns array of lines with tree structure
 */
export function formatDependencyTree(plans: PlanInfo[]): string[] {
  const tree = buildDependencyTree(plans);
  const lines: string[] = [];

  function formatNode(
    node: DependencyNode,
    prefix: string,
    isLast: boolean,
  ): void {
    const statusIcon = getStatusIcon(node.plan.status);
    const connector = isLast ? "└─" : "├─";

    lines.push(
      `${prefix}${connector}${statusIcon} ${node.plan.slug} - ${node.plan.date}: ${node.plan.title}`,
    );

    const childPrefix = prefix + (isLast ? "  " : "│ ");
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      formatNode(child, childPrefix, i === node.children.length - 1);
    }
  }

  for (let i = 0; i < tree.length; i++) {
    const root = tree[i];
    if (!root) continue;
    formatNode(root, "", i === tree.length - 1);
  }

  return lines;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "●";
    case "in-progress":
      return "◐";
    case "pending":
      return "○";
    case "cancelled":
    case "abandoned":
      return "✗";
    default:
      return "?";
  }
}
