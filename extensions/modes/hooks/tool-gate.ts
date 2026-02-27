import { parse } from "@aliou/sh";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const AD_NOTIFY_DANGEROUS_EVENT = "ad:notify:dangerous";
const GUARDRAILS_DANGEROUS_EVENT = "guardrails:dangerous"; // compat

import { showModeConfirmDialog } from "../components/mode-confirm";
import {
  addSessionAllowedTool,
  getCurrentMode,
  getSessionAllowedTools,
} from "../state";
import { walkCommands, wordToString } from "../utils/shell";

function getBashCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const value = (input as { command?: unknown }).command;
  return typeof value === "string" ? value : "";
}

function extractBashCommandNames(command: string): string[] | null {
  try {
    const { ast } = parse(command);
    const names: string[] = [];
    walkCommands(ast, (cmd) => {
      const first = cmd.words?.[0];
      if (!first) return false;
      const name = wordToString(first).trim();
      if (name) names.push(name);
      return false;
    });
    return names;
  } catch {
    return null;
  }
}

function isSessionAllowedBash(
  sessionAllowed: Set<string>,
  commandNames: string[] | null,
): boolean {
  if (sessionAllowed.has("bash")) return true;
  if (!commandNames || commandNames.length === 0) return false;
  return commandNames.every((name) => sessionAllowed.has(`bash:${name}`));
}

function addSessionAllowForBash(commandNames: string[] | null): void {
  if (!commandNames || commandNames.length === 0) {
    addSessionAllowedTool("bash");
    return;
  }

  for (const name of commandNames) {
    addSessionAllowedTool(`bash:${name}`);
  }
}

function formatBlockedReason(modeName: string, toolName: string): string {
  return `Blocked by ${modeName} mode: ${toolName} is denied`;
}

function formatNoUiReason(modeName: string, toolName: string): string {
  return `Blocked by ${modeName} mode: ${toolName} is not allowlisted (no UI to confirm)`;
}

function emitDangerousEvent(
  pi: ExtensionAPI,
  description: string,
  command = "",
): void {
  const payload = {
    source: "modes:tool-gate",
    command,
    description,
    pattern: "(mode-gate)",
  };

  pi.events.emit(AD_NOTIFY_DANGEROUS_EVENT, payload);
  pi.events.emit(GUARDRAILS_DANGEROUS_EVENT, payload);
}

async function confirmUnlistedTool(
  ctx: ExtensionContext,
  modeName: string,
  toolName: string,
  bashCommand?: string,
): Promise<"allow" | "allow-session" | "deny"> {
  if (!ctx.hasUI) return "deny";
  return showModeConfirmDialog(ctx, modeName, toolName, bashCommand);
}

export function setupToolGateHook(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    const mode = getCurrentMode();

    if (mode.name === "default") {
      return;
    }

    if (mode.deniedTools.includes(event.toolName)) {
      if (event.toolName === "bash") {
        emitDangerousEvent(
          pi,
          `Blocked by ${mode.name} mode: bash is denied`,
          getBashCommand(event.input),
        );
      }

      return {
        block: true,
        reason: formatBlockedReason(mode.name, event.toolName),
      };
    }

    const sessionAllowed = getSessionAllowedTools();
    const bashCommand =
      event.toolName === "bash" ? getBashCommand(event.input) : "";
    const bashCommandNames =
      event.toolName === "bash" ? extractBashCommandNames(bashCommand) : null;

    if (mode.allowedTools.includes(event.toolName)) {
      if (event.toolName !== "bash" || !mode.bashAllowedCommands) {
        return;
      }

      const allowedBash = new Set(mode.bashAllowedCommands);
      if (bashCommandNames && bashCommandNames.length > 0) {
        const allAllowed = bashCommandNames.every((name) =>
          allowedBash.has(name),
        );
        if (allAllowed) return;
      }
      // fall through to confirmation for parse failure or disallowed command
    } else {
      if (sessionAllowed.has(event.toolName)) {
        return;
      }
    }

    if (
      event.toolName === "bash" &&
      isSessionAllowedBash(sessionAllowed, bashCommandNames)
    ) {
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: formatNoUiReason(mode.name, event.toolName),
      };
    }

    emitDangerousEvent(
      pi,
      `Confirmation required by ${mode.name} mode: ${event.toolName} is not allowlisted`,
      event.toolName === "bash" ? bashCommand : event.toolName,
    );

    const decision = await confirmUnlistedTool(
      ctx,
      mode.name,
      event.toolName,
      event.toolName === "bash" ? bashCommand : undefined,
    );

    if (decision === "allow") {
      return;
    }

    if (decision === "allow-session") {
      if (event.toolName === "bash") {
        addSessionAllowForBash(bashCommandNames);
      } else {
        addSessionAllowedTool(event.toolName);
      }
      return;
    }

    return { block: true, reason: "Blocked by user" };
  });
}
