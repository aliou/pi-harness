/**
 * Path display utilities for tool formatters.
 */

import { homedir } from "node:os";
import { relative } from "node:path";

/**
 * Shorten a path for display. Tries cwd-relative first, then tilde for home.
 *
 * - If cwd is provided and the result is short, returns relative path (e.g. "src/foo.ts")
 * - If the relative path is long (many "../"), replaces $HOME with ~ instead
 * - If path is already relative, returns as-is
 */
export function shortenPath(path: string, cwd?: string): string {
  if (!path.startsWith("/")) return path;

  if (cwd) {
    const rel = relative(cwd, path);
    // Use relative if it doesn't escape too far up
    if (!rel.startsWith("../../..")) {
      return rel || ".";
    }
  }

  // Fall back to tilde notation
  const home = homedir();
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }

  return path;
}
