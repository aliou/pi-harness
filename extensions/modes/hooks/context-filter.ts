import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function setupContextFilterHook(pi: ExtensionAPI): void {
  pi.on("context", async (event) => {
    const messages = event.messages.filter((message) => {
      const maybeCustom = message as { customType?: unknown };
      return maybeCustom.customType !== "mode-switch";
    });

    return { messages };
  });
}
