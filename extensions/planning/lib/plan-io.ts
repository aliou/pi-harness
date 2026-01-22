/**
 * Plan file I/O operations
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { deriveSlug } from "./dependencies";
import { parseFrontmatter, updateFrontmatterField } from "./frontmatter";
import type { PlanInfo, PlanStatus } from "./types";

export const PLANS_DIR = ".agents/plans";

/**
 * List all plans in the plans directory
 */
export async function listPlans(cwd: string): Promise<PlanInfo[]> {
  const plansPath = path.join(cwd, PLANS_DIR);

  try {
    const files = await fs.readdir(plansPath);
    const mdFiles = files
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();

    const plans: PlanInfo[] = [];
    for (const filename of mdFiles) {
      const fullPath = path.join(plansPath, filename);
      const content = await fs.readFile(fullPath, "utf-8");

      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) continue;

      // Extract fields from frontmatter
      const title =
        (frontmatter.title as string) || filename.replace(".md", "");
      const date = (frontmatter.date as string) || "";
      const directory = (frontmatter.directory as string) || cwd;
      const project = frontmatter.project as string | undefined;
      const status = (frontmatter.status as PlanStatus) || "pending";
      const dependencies = Array.isArray(frontmatter.dependencies)
        ? (frontmatter.dependencies as string[])
        : [];
      const dependents = Array.isArray(frontmatter.dependents)
        ? (frontmatter.dependents as string[])
        : [];

      const slug = deriveSlug(filename);

      plans.push({
        filename,
        path: fullPath,
        slug,
        date,
        title,
        directory,
        project,
        status,
        dependencies,
        dependents,
      });
    }

    return plans;
  } catch {
    return [];
  }
}

/**
 * Read a plan file
 */
export async function readPlan(planPath: string): Promise<string> {
  return fs.readFile(planPath, "utf-8");
}

/**
 * Update plan status in frontmatter
 */
export async function updatePlanStatus(
  planPath: string,
  status: PlanStatus,
): Promise<void> {
  const content = await fs.readFile(planPath, "utf-8");
  const updated = updateFrontmatterField(content, "status", status);
  await fs.writeFile(planPath, updated, "utf-8");
}

/**
 * Delete a plan file
 */
export async function deletePlan(planPath: string): Promise<void> {
  await fs.unlink(planPath);
}
