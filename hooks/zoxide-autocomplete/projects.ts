import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ProjectInfo {
  /** Path inserted on completion: tilde path under $HOME, absolute otherwise. */
  path: string;
  /** Display label: the last two path segments below `~`, e.g. aliou/pi. */
  label: string;
  /** Zoxide frecency score. */
  score: number;
}

function toDisplayPath(dir: string, home: string): string {
  return dir === home || dir.startsWith(`${home}/`)
    ? `~${dir.slice(home.length)}`
    : dir;
}

function toLabel(path: string): string {
  const segments = path.split("/").filter((s) => s && s !== "~");
  const isTopLevel = path.startsWith("/") && segments.length === 1;
  return isTopLevel ? path : segments.slice(-2).join("/") || path;
}

/**
 * List every directory in the zoxide database.
 *
 * Results preserve zoxide frecency order, with alpha fallback for ties or
 * malformed score lines.
 */
export async function listProjects(
  pi: ExtensionAPI,
  signal?: AbortSignal,
): Promise<ProjectInfo[]> {
  const home = homedir();
  const result = await pi.exec("zoxide", ["query", "-ls"], { signal });

  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }

  const projects: ProjectInfo[] = [];

  for (const line of result.stdout.split("\n")) {
    const match = line.trim().match(/^(\S+)\s+(.+)$/);
    if (!match) continue;

    const score = Number(match[1]);
    const dir = (match[2] ?? "").replace(/\/+$/, "");
    if (!dir) continue;

    const path = toDisplayPath(dir, home);
    const label = toLabel(path);

    projects.push({
      path,
      label,
      score: Number.isFinite(score) ? score : 0,
    });
  }

  return projects.sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
}
