/**
 * Plan file I/O operations
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { deriveSlug } from "./dependencies";
import { parseFrontmatter, updateFrontmatterField } from "./frontmatter";
import type { PlanInfo, PlanStatus } from "./types";

export const PLANS_DIR = ".agents/plans";

const FRONTMATTER_SCAN_CHUNK_BYTES = 4096;
const FRONTMATTER_SCAN_MAX_BYTES = 64 * 1024;

function findFrontmatterEnd(content: string): number | null {
  // Match the closing delimiter after the opening frontmatter line.
  // Accepts both LF and CRLF and supports EOF right after the closing --- line.
  const match = content.slice(4).match(/\r?\n---(?:\r?\n|$)/);
  if (!match || match.index === undefined) return null;
  return 4 + match.index + match[0].length;
}

/**
 * Read markdown frontmatter from a plan file by scanning only the header region.
 * Falls back to a full read if the frontmatter doesn't close within scan limit.
 */
async function readPlanFrontmatterContent(planPath: string): Promise<string> {
  const file = await fs.open(planPath, "r");
  try {
    let position = 0;
    let scannedBytes = 0;
    let content = "";

    while (scannedBytes < FRONTMATTER_SCAN_MAX_BYTES) {
      const remaining = FRONTMATTER_SCAN_MAX_BYTES - scannedBytes;
      const chunkSize = Math.min(FRONTMATTER_SCAN_CHUNK_BYTES, remaining);
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await file.read(buffer, 0, chunkSize, position);
      if (bytesRead <= 0) break;

      scannedBytes += bytesRead;
      position += bytesRead;
      content += buffer.toString("utf-8", 0, bytesRead);

      if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
        return "";
      }

      const end = findFrontmatterEnd(content);
      if (end !== null) {
        return content.slice(0, end);
      }
    }

    // Unusually large header: keep behavior correct by parsing full content.
    return await fs.readFile(planPath, "utf-8");
  } finally {
    await file.close();
  }
}

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
      const content = await readPlanFrontmatterContent(fullPath);

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
