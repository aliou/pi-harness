import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { showModeSelector } from "../components/mode-selector";
import { DEFAULT_MODE, MODE_ORDER, MODES } from "../modes";
import { getCurrentMode } from "../state";

export type ApplyModeFn = (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  modeName: string,
  options?: { silent?: boolean },
) => Promise<void>;

export function registerModeControls(
  pi: ExtensionAPI,
  applyMode: ApplyModeFn,
): void {
  pi.registerCommand("mode", {
    description: "Switch mode (default, plan, research)",
    handler: async (args, ctx) => {
      const requested = args?.trim();

      if (requested) {
        if (!MODES[requested]) {
          ctx.ui.notify(
            `Unknown mode. Available: ${MODE_ORDER.join(", ")}`,
            "error",
          );
          return;
        }

        await applyMode(pi, ctx, requested);
        return;
      }

      const selected = await showModeSelector(pi, ctx);
      if (!selected) return;
      await applyMode(pi, ctx, selected);
    },
  });

  pi.registerShortcut(Key.ctrl("u"), {
    description: "Cycle modes",
    handler: async (ctx) => {
      const current = getCurrentMode().name;
      const index = MODE_ORDER.indexOf(current);
      const nextIndex = index === -1 ? 0 : (index + 1) % MODE_ORDER.length;
      const nextMode = MODE_ORDER[nextIndex] ?? DEFAULT_MODE.name;
      await applyMode(pi, ctx, nextMode);
    },
  });
}
