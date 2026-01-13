import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { generateTitle, getFirstUserText } from "./lib/title";

export function setupCommands(pi: ExtensionAPI) {
  pi.registerCommand("ad-name", {
    description: "Set or generate session name",
    handler: async (args, ctx) => {
      const input = args.trim();

      // /name auto - force regenerate
      if (input === "auto") {
        const firstUserText = getFirstUserText(ctx);
        if (!firstUserText?.trim()) {
          ctx.ui.notify("No user message to generate title from", "warning");
          return;
        }

        try {
          const title = await generateTitle(firstUserText, ctx);
          if (title) {
            pi.setSessionName(title);
            ctx.ui.notify(`Session: ${title}`, "info");
          } else {
            ctx.ui.notify("Failed to generate title", "error");
          }
        } catch {
          ctx.ui.notify("Failed to generate title", "error");
        }
        return;
      }

      // /name foo - set manually
      if (input) {
        pi.setSessionName(input);
        ctx.ui.notify(`Session: ${input}`, "info");
        return;
      }

      // /name (no args)
      const currentName = pi.getSessionName();
      if (currentName) {
        // Has name - display it with hint
        ctx.ui.notify(
          `Session: ${currentName} (use /ad-name <text> to change)`,
          "info",
        );
        return;
      }

      // No name - auto generate
      const firstUserText = getFirstUserText(ctx);
      if (!firstUserText?.trim()) {
        ctx.ui.notify("No user message to generate title from", "warning");
        return;
      }

      try {
        const title = await generateTitle(firstUserText, ctx);
        if (title) {
          pi.setSessionName(title);
          ctx.ui.notify(`Session: ${title}`, "info");
        } else {
          ctx.ui.notify("Failed to generate title", "error");
        }
      } catch {
        ctx.ui.notify("Failed to generate title", "error");
      }
    },
  });
}
