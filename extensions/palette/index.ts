import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { getPaletteCommands } from "./commands";
import { openPalette } from "./commands/open-palette";
import { configLoader } from "./config";
import { registerContextFilter } from "./hooks/context-filter";
import { registerRenderers } from "./hooks/renderers";
import { createRegistry } from "./registry/create-registry";
import {
  type ExternalPaletteCommand,
  PALETTE_REGISTER_EVENT,
  wrapExternalCommand,
} from "./registry/external";

export default async function (pi: ExtensionAPI): Promise<void> {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;

  const registry = createRegistry(getPaletteCommands());

  pi.events.on(PALETTE_REGISTER_EVENT, (data: unknown) => {
    const ext = data as ExternalPaletteCommand;
    if (
      !ext ||
      typeof ext.id !== "string" ||
      typeof ext.execute !== "function"
    ) {
      return;
    }
    registry.add(wrapExternalCommand(ext));
  });

  pi.events.emit("palette:ready", undefined);

  registerRenderers(pi);
  registerContextFilter(pi);

  // Keep Ctrl+P as the only entry point for opening the palette.
  // pi.registerCommand("palette", {
  //   description: "Open command palette",
  //   handler: async (_args, ctx) => {
  //     await openPalette(pi, ctx, registry, config);
  //   },
  // });

  pi.registerShortcut(Key.ctrl("p"), {
    description: "Open command palette",
    handler: async (ctx) => {
      await openPalette(pi, ctx, registry, config);
    },
  });
}
