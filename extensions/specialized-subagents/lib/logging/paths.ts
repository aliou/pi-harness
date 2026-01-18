import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Sanitize a path for use as a directory name.
 * Mirrors Pi's session storage: /Users/foo/bar -> --Users-foo-bar--
 */
export function sanitizePath(p: string): string {
  // Replace path separators with dashes, wrap with double dashes
  const sanitized = p.replace(/[/\\]/g, "-");
  return `--${sanitized}--`;
}

/**
 * Generate a unique run ID.
 * Format: <name>-<YYYYMMDD-HHMMSS>-<random6>
 * Example: oracle-20260112-100000-a1b2c3
 */
export function generateRunId(subagentName: string): string {
  const now = new Date();
  const timestamp = (now.toISOString().split(".")[0] ?? "") // Remove milliseconds: 2026-01-12T11:28:17
    .replace(/[-:T]/g, ""); // YYYYMMDDHHMMSS
  const formatted = timestamp.replace(/(\d{8})(\d{6})/, "$1-$2"); // YYYYMMDD-HHMMSS
  const random = crypto.randomBytes(3).toString("hex"); // 6 chars
  return `${subagentName}-${formatted}-${random}`;
}

/**
 * Get the log directory for a subagent run.
 *
 * Structure mirrors Pi sessions:
 * ~/.pi/agent/subagents/<sanitized-cwd>/<subagent-name>/<run-id>/
 *
 * @param cwd - Current working directory
 * @param subagentName - Name of the subagent (e.g., "oracle")
 * @param runId - Unique run identifier
 * @param agentDir - Agent config directory (default: ~/.pi/agent)
 */
export function getLogDirectory(
  cwd: string,
  subagentName: string,
  runId: string,
  agentDir?: string,
): string {
  const baseDir = agentDir ?? path.join(os.homedir(), ".pi", "agent");
  const sanitizedCwd = sanitizePath(cwd);
  return path.join(baseDir, "subagents", sanitizedCwd, subagentName, runId);
}
