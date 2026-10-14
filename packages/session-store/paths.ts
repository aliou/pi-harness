/**
 * Session directory path utilities.
 *
 * Moved from:
 * - breadcrumbs/lib/session-search.ts: getSessionsDir(), encodeCwd(), decodeCwd()
 */

import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Get the sessions directory, respecting PI_CODING_AGENT_DIR env var. */
export function getSessionsDir(): string {
  return join(getAgentDir(), "sessions");
}

/**
 * Encode a cwd path to session directory format.
 * "/Users/foo/code" -> "--Users-foo-code--"
 */
export function encodeCwd(cwd: string): string {
  // Resolve to absolute path first to normalize ".." and "." segments.
  // Uses resolve() not realpathSync() because Pi stores sessions using the
  // logical path, not the symlink target.
  const resolved = resolve(cwd);
  // Strip leading slash, replace all slashes with hyphens
  const stripped = resolved.replace(/^[/\\]/, "");
  const encoded = stripped.replace(/[/\\]/g, "-");
  return `--${encoded}--`;
}

/**
 * Decode a session directory name back to a cwd path.
 * "--Users-foo-code--" -> "/Users/foo/code"
 */
export function decodeCwd(encoded: string): string {
  // Strip the leading and trailing "--"
  const stripped = encoded.replace(/^--/, "").replace(/--$/, "");
  // Replace hyphens with slashes and prepend leading slash
  return `/${stripped.replace(/-/g, "/")}`;
}
