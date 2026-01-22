/**
 * Types for planning extension
 */

export type PlanStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "abandoned";

export interface PlanInfo {
  filename: string;
  path: string;
  slug: string;
  date: string;
  title: string;
  directory: string;
  project?: string;
  status: PlanStatus;
  dependencies: string[];
  dependents: string[];
}

export interface DependencyNode {
  plan: PlanInfo;
  children: DependencyNode[]; // plans that depend on this
}

export interface DependencyCheckResult {
  resolved: PlanInfo[];
  unresolved: string[]; // slugs not found or not completed
}
