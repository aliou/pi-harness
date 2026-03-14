import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const SESSION_ENTRY_TYPE = "providers-codex-fast";
const PALETTE_REGISTER = "palette:register";

type FastModeState = {
  enabled?: boolean;
};

let fastModeEnabled = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenAICodexProvider(ctx: ExtensionContext): boolean {
  return ctx.model?.provider === "openai-codex";
}

function readFastModeState(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.getEntries();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom") continue;
    if (entry.customType !== SESSION_ENTRY_TYPE) continue;

    const data = entry.data as FastModeState | undefined;
    return data?.enabled === true;
  }

  return false;
}

function persistFastModeState(pi: ExtensionAPI, enabled: boolean): void {
  pi.appendEntry(SESSION_ENTRY_TYPE, { enabled });
}

function notifyFastModeState(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (!fastModeEnabled) {
    ctx.ui.notify(
      "Codex fast mode disabled. OpenAI Codex requests will use the default service tier.",
      "info",
    );
    return;
  }

  if (isOpenAICodexProvider(ctx)) {
    ctx.ui.notify(
      "Codex fast mode enabled. OpenAI Codex requests will send service_tier=priority.",
      "info",
    );
    return;
  }

  ctx.ui.notify(
    "Codex fast mode enabled. It will apply when you switch to an OpenAI Codex model.",
    "info",
  );
}

function setFastMode(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  enabled: boolean,
  options?: { notify?: boolean; persist?: boolean },
): void {
  fastModeEnabled = enabled;

  if (options?.persist !== false) {
    persistFastModeState(pi, enabled);
  }

  if (options?.notify !== false) {
    notifyFastModeState(ctx);
  }
}

function emitPaletteRegistration(pi: ExtensionAPI): void {
  pi.events.emit(PALETTE_REGISTER, {
    id: "providers.codex-fast.toggle",
    title: "Toggle Codex fast mode",
    description: "Use priority service tier for OpenAI Codex requests",
    keywords: ["codex", "fast", "priority", "service tier", "providers"],
    group: "model",
    isEnabled: (c: { ctx: ExtensionContext }) => {
      if (c.ctx.model?.provider !== "openai-codex") {
        return {
          enabled: false,
          reason: "Requires an OpenAI Codex model",
        };
      }

      return true;
    },
    execute: async (ctx: ExtensionContext) => {
      setFastMode(pi, ctx, !fastModeEnabled);
    },
  });
}

export function setupCodexFastModeHooks(pi: ExtensionAPI): void {
  emitPaletteRegistration(pi);
  pi.events.on("palette:ready", () => {
    emitPaletteRegistration(pi);
  });

  pi.on("session_start", async (_event, ctx) => {
    fastModeEnabled = readFastModeState(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    fastModeEnabled = readFastModeState(ctx);
  });

  pi.on("model_select", async (event, ctx) => {
    if (!ctx.hasUI) return;
    if (event.source === "restore") return;
    if (event.model.provider !== "openai-codex") return;
    if (event.previousModel?.provider === "openai-codex") return;

    const suffix = fastModeEnabled ? " It is currently enabled." : "";
    ctx.ui.notify(
      `Codex fast mode is available for this model. Toggle it from the palette.${suffix}`,
      "info",
    );
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (
      !fastModeEnabled ||
      !isOpenAICodexProvider(ctx) ||
      !isRecord(event.payload)
    ) {
      return;
    }

    if (Object.hasOwn(event.payload, "service_tier")) {
      return;
    }

    return {
      ...event.payload,
      service_tier: "priority",
    };
  });
}
