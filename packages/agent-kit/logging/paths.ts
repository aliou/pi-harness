import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Sanitize a path for use as a directory name.
 * Mirrors Pi's session storage: /Users/foo/bar -> --Users-foo-bar--
 */
export function sanitizePath(p: string): string {
  const sanitized = p.replace(/[/\\]/g, "-");
  return `--${sanitized}--`;
}

/**
 * Generate a unique run ID.
 * Format: <name>-<YYYYMMDD-HHMMSS>-<random6>
 */
export function generateRunId(subagentName: string): string {
  const now = new Date();
  const timestamp = (now.toISOString().split(".")[0] ?? "").replace(
    /[-:T]/g,
    "",
  );
  const formatted = timestamp.replace(/(\d{8})(\d{6})/, "$1-$2");
  const random = crypto.randomBytes(3).toString("hex");
  return `${subagentName}-${formatted}-${random}`;
}

/**
 * Get the log directory for a subagent run.
 *
 * Structure: ~/.pi/agent/subagents/<sanitized-cwd>/<subagent-name>/<run-id>/
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
