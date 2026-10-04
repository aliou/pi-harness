import { globSync } from "node:fs";
import { basename, join } from "node:path";
import {
  type CustomEntry,
  type ExtensionContext,
  getAgentDir,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { isEmptyArray, isNil, isSoleArray } from "@harness/utils";
import type { ReadSessionState } from "../types";

const isReadSessionStateEntry = (
  e: SessionEntry,
): e is CustomEntry<ReadSessionState> =>
  e.type === "custom" && e.customType === "read-session-state";

export const getTargetSessionId = (ctx: ExtensionContext) => {
  const stateEntry: CustomEntry<ReadSessionState> | undefined =
    ctx.sessionManager.getEntries().filter(isReadSessionStateEntry).at(0);

  if (isNil(stateEntry) || isNil(stateEntry.data)) {
    throw new Error("Missing session state");
  }

  return stateEntry.data.targetSessionId;
};

const resolveSessionPath = (
  sessionIdOrPath: string,
  sessionsDir: string,
): string => {
  // If it looks like a file path, use as-is
  if (sessionIdOrPath.includes("/") || sessionIdOrPath.endsWith(".jsonl")) {
    return sessionIdOrPath;
  }

  // Fast lookup: session filenames are <timestamp>_<uuid>.jsonl,
  // so glob the sessions dir for the UUID instead of parsing all 2000+ files.
  const pattern = `**/*${sessionIdOrPath}*.jsonl`;
  const matches = globSync(pattern, { cwd: sessionsDir });

  if (isEmptyArray(matches)) {
    throw new Error(`No session found with id matching '${sessionIdOrPath}'`);
  }

  if (!isSoleArray(matches)) {
    // Multiple matches — try exact UUID match (filename format: <timestamp>_<uuid>.jsonl)
    const exact = matches.find((m) => {
      const base = basename(m, ".jsonl");
      const uuid = base.split("_").slice(1).join("_");
      return uuid === sessionIdOrPath;
    });
    if (exact) return join(sessionsDir, exact);
    throw new Error(
      `Ambiguous session id '${sessionIdOrPath}' matched ${matches.length} sessions. Provide a longer prefix.`,
    );
  }

  return join(sessionsDir, matches[0]);
};

export const getTargetSessionPath = async (ctx: ExtensionContext) => {
  const targetSessionId = getTargetSessionId(ctx);
  const sessionsDir = join(getAgentDir(), "sessions");
  return resolveSessionPath(targetSessionId, sessionsDir);
};
