import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { ModeEditor } from "../components/mode-editor";
import { DEFAULT_MODE, MODE_ORDER, MODES } from "../modes";
import {
  clearSessionAllowedTools,
  getCurrentMode,
  setCurrentMode,
  setRequestRender,
  triggerRender,
} from "../state";
import { debugNotify } from "./debug";
import { sendModeSwitchMessage } from "./mode-switch";

export function getLastModeFromBranch(ctx: ExtensionContext): string | null {
  const entries = ctx.sessionManager.getBranch() as Array<{
    type?: string;
    customType?: string;
    data?: { mode?: unknown };
  }>;

  const last = entries
    .filter(
      (entry) => entry.type === "custom" && entry.customType === "mode-state",
    )
    .at(-1);

  const mode = last?.data?.mode;
  return typeof mode === "string" ? mode : null;
}

export async function applyMode(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  modeName: string,
  options?: { silent?: boolean },
): Promise<void> {
  const mode = MODES[modeName];
  if (!mode) {
    ctx.ui.notify(`Unknown mode. Available: ${MODE_ORDER.join(", ")}`, "error");
    return;
  }

  const previousModeName = getCurrentMode().name;
  debugNotify(
    ctx,
    `applyMode start: ${previousModeName} -> ${modeName}${options?.silent ? " (silent)" : ""}`,
  );

  if (previousModeName === modeName) {
    debugNotify(ctx, `applyMode noop: already in ${modeName}`);
    return;
  }

  setCurrentMode(mode);
  clearSessionAllowedTools();

  // Tool set policy: denylist-only.
  // On each switch, start from all available tools and remove denied tools.
  const allToolNames = pi.getAllTools().map((tool) => tool.name);
  const denied = new Set(mode.deniedTools);
  const active = allToolNames.filter((name) => !denied.has(name));
  pi.setActiveTools(active);

  if (!options?.silent) {
    pi.appendEntry("mode-state", { mode: modeName });
    sendModeSwitchMessage(
      pi,
      { mode: modeName, from: previousModeName },
      `Switched to ${modeName.toUpperCase()} mode.`,
    );
    ctx.ui.notify(`Mode: ${modeName}`, "info");
  }

  if (mode.provider && mode.model) {
    const found = ctx.modelRegistry.find(mode.provider, mode.model);
    if (found) {
      await pi.setModel(found);
    } else {
      ctx.ui.notify(
        `Model ${mode.provider}/${mode.model} not found`,
        "warning",
      );
    }
  }

  triggerRender();
  debugNotify(ctx, `applyMode done: current=${getCurrentMode().name}`);
}

export function setupEditor(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    setRequestRender(undefined);
    return;
  }

  debugNotify(ctx, "setupEditor: installing ModeEditor");

  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const editor = new ModeEditor(tui, theme, keybindings);
    editor.modeProvider = () => getCurrentMode();
    setRequestRender(() => editor.requestRenderNow());
    debugNotify(
      ctx,
      `setupEditor: ModeEditor ready (mode=${getCurrentMode().name})`,
    );
    return editor;
  });
}

export async function restoreModeForSession(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  includeFlag: boolean,
): Promise<void> {
  debugNotify(
    ctx,
    `restoreModeForSession start (includeFlag=${String(includeFlag)})`,
  );

  const restored = getLastModeFromBranch(ctx);
  const baseMode = restored ?? DEFAULT_MODE.name;
  debugNotify(ctx, `restoreModeForSession branch mode=${restored ?? "<none>"}`);

  const from = getCurrentMode().name;
  await applyMode(pi, ctx, baseMode, { silent: true });
  if (from !== baseMode && restored) {
    sendModeSwitchMessage(
      pi,
      { mode: baseMode, from },
      `Restored ${baseMode.toUpperCase()} mode.`,
    );
    ctx.ui.notify(`Restored mode: ${baseMode}`, "info");
  }

  if (includeFlag) {
    const modeFlag = pi.getFlag("agent-mode");
    debugNotify(
      ctx,
      `restoreModeForSession --agent-mode flag=${String(modeFlag)}`,
    );
    if (typeof modeFlag === "string" && modeFlag.trim()) {
      const requested = modeFlag.trim();
      const fromFlag = getCurrentMode().name;
      await applyMode(pi, ctx, requested, { silent: true });
      if (fromFlag !== requested) {
        sendModeSwitchMessage(
          pi,
          { mode: requested, from: fromFlag },
          `Flag set ${requested.toUpperCase()} mode.`,
        );
        ctx.ui.notify(`Flag mode: ${requested}`, "info");
      }
    }
  }

  setupEditor(ctx);
  debugNotify(
    ctx,
    `restoreModeForSession done (current=${getCurrentMode().name})`,
  );
}
