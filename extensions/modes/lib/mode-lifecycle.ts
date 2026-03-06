import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { ModeEditor } from "../components/mode-editor";
import { DEFAULT_MODE, MODE_ORDER, MODES } from "../modes";
import {
  clearPreviousModel,
  clearSessionAllowedTools,
  getCurrentMode,
  getPreviousModel,
  setCurrentMode,
  setPreviousModel,
  setRequestRender,
  triggerRender,
} from "../state";
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
  if (previousModeName === modeName) {
    return;
  }

  let targetModelId: string | undefined;

  if (previousModeName === "default" && modeName !== "default" && ctx.model) {
    setPreviousModel(ctx.model);
  }

  if (previousModeName !== "default" && modeName === "default") {
    targetModelId = getPreviousModel()?.id;
  } else if (mode.provider && mode.model) {
    targetModelId =
      ctx.modelRegistry.find(mode.provider, mode.model)?.id ?? mode.model;
  } else {
    targetModelId = ctx.model?.id;
  }

  setCurrentMode(mode);
  clearSessionAllowedTools();

  const allToolNames = pi.getAllTools().map((tool) => tool.name);
  const denied = new Set(mode.deniedTools);
  const active = allToolNames.filter((name) => !denied.has(name));
  pi.setActiveTools(active);

  if (!options?.silent) {
    pi.appendEntry("mode-state", { mode: modeName });
    sendModeSwitchMessage(
      pi,
      { mode: modeName, from: previousModeName, model: targetModelId },
      `Switched to ${modeName.toUpperCase()} mode.`,
    );
  }

  if (previousModeName !== "default" && modeName === "default") {
    const savedModel = getPreviousModel();
    if (savedModel) {
      await pi.setModel(savedModel);
      clearPreviousModel();
    }
  } else if (mode.provider && mode.model) {
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
}

export function setupEditor(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    setRequestRender(undefined);
    return;
  }

  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const editor = new ModeEditor(tui, theme, keybindings);
    editor.modeProvider = () => getCurrentMode();
    setRequestRender(() => editor.requestRenderNow());
    return editor;
  });
}

export async function restoreModeForSession(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  includeFlag: boolean,
): Promise<void> {
  clearPreviousModel();

  const restored = getLastModeFromBranch(ctx);
  const baseMode = restored ?? DEFAULT_MODE.name;

  const from = getCurrentMode().name;
  await applyMode(pi, ctx, baseMode, { silent: true });
  if (from !== baseMode && restored) {
    let targetModelId: string | undefined;
    if (baseMode === DEFAULT_MODE.name) {
      targetModelId = getPreviousModel()?.id ?? ctx.model?.id;
    } else {
      const mode = MODES[baseMode];
      targetModelId =
        mode?.provider && mode.model
          ? (ctx.modelRegistry.find(mode.provider, mode.model)?.id ??
            mode.model)
          : ctx.model?.id;
    }

    sendModeSwitchMessage(
      pi,
      { mode: baseMode, from, model: targetModelId },
      `Restored ${baseMode.toUpperCase()} mode.`,
    );
  }

  if (includeFlag) {
    const modeFlag = pi.getFlag("agent-mode");
    if (typeof modeFlag === "string" && modeFlag.trim()) {
      const requested = modeFlag.trim();
      const fromFlag = getCurrentMode().name;
      await applyMode(pi, ctx, requested, { silent: true });
      if (fromFlag !== requested) {
        let targetModelId: string | undefined;
        if (requested === DEFAULT_MODE.name) {
          targetModelId = getPreviousModel()?.id ?? ctx.model?.id;
        } else {
          const mode = MODES[requested];
          targetModelId =
            mode?.provider && mode.model
              ? (ctx.modelRegistry.find(mode.provider, mode.model)?.id ??
                mode.model)
              : ctx.model?.id;
        }

        sendModeSwitchMessage(
          pi,
          { mode: requested, from: fromFlag, model: targetModelId },
          `Flag set ${requested.toUpperCase()} mode.`,
        );
      }
    }
  }

  setupEditor(ctx);
}
