import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getPiVersion } from "../utils";

export function setupChromeHook(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const theme = ctx.ui.theme;
    const version = getPiVersion();

    // Header
    ctx.ui.setHeader((_tui, _theme) => ({
      render(width: number): string[] {
        const logo =
          theme.bold(theme.fg("accent", "pi")) +
          theme.fg("dim", ` v${version}`);
        return [truncateToWidth(` ${logo}`, width), ""];
      },
      invalidate() {},
    }));
  });
}
