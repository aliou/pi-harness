/**
 * Register breadcrumbs commands with the palette extension via EventBus.
 *
 * Emits "palette:register" events immediately and re-emits when
 * the palette signals readiness (handles load-order differences).
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { PaletteCommandContext } from "../../palette/registry/types";
import { submitSlashCommandViaEditor } from "../../palette/utils/submit-command";

const PALETTE_REGISTER = "palette:register";
const PALETTE_READY = "palette:ready";

async function dispatchPaletteCommand(
  ctx: ExtensionContext,
  commandName: string,
  input?: string,
): Promise<void> {
  const suffix = input?.trim();
  const commandText = suffix ? `/${commandName} ${suffix}` : `/${commandName}`;
  await submitSlashCommandViaEditor(ctx, commandText);
}

function hasSessionMessages(ctx: ExtensionContext): boolean {
  return ctx.sessionManager
    .getBranch()
    .some((entry) => entry?.type === "message");
}

function emitRegistrations(pi: ExtensionAPI): void {
  pi.events.emit(PALETTE_REGISTER, {
    id: "session.spawn",
    title: "Spawn session",
    description: "New session linked to this one",
    keywords: ["spawn", "new", "session", "fork"],
    group: "session",
    input: {
      type: "text",
      title: "Note",
      placeholder: "Optional focus for the new session",
      optional: true,
    },
    isEnabled: (c: PaletteCommandContext) => {
      if (!hasSessionMessages(c.ctx)) {
        return { enabled: false, reason: "No messages in the current session" };
      }
      return true;
    },
    execute: async (ctx: ExtensionContext, input?: string) => {
      await dispatchPaletteCommand(ctx, "spawn", input);
    },
  });

  pi.events.emit(PALETTE_REGISTER, {
    id: "session.handoff",
    title: "Handoff session",
    description: "New session with extracted context",
    keywords: ["handoff", "context", "extract", "session"],
    group: "session",
    input: {
      type: "text",
      title: "Goal",
      placeholder: "e.g. implement OAuth support for Linear API",
    },
    isEnabled: (c: PaletteCommandContext) => {
      if (!hasSessionMessages(c.ctx)) {
        return { enabled: false, reason: "No messages in the current session" };
      }
      return true;
    },
    execute: async (ctx: ExtensionContext, input?: string) => {
      if (!input) return;
      await dispatchPaletteCommand(ctx, "handoff", input);
    },
  });
}

export function setupPaletteRegistration(pi: ExtensionAPI): void {
  emitRegistrations(pi);

  pi.events.on(PALETTE_READY, () => {
    emitRegistrations(pi);
  });
}
