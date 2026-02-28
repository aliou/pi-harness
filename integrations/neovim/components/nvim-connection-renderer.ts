import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

interface NvimConnectionDetails {
  status: "connected" | "disconnected" | "multiple" | "none";
  pid?: number;
  socket?: string;
  instanceCount?: number;
}

export function registerNvimConnectionRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer("nvim-connection", (message, _options, theme) => {
    const details = message.details as NvimConnectionDetails | undefined;
    const box = new Box(1, 0, (s) => theme.bg("customMessageBg", s));

    if (!details) {
      box.addChild(new Text(theme.fg("dim", message.content), 0, 0));
      return box;
    }

    switch (details.status) {
      case "connected": {
        const pid = details.pid ? theme.fg("dim", ` (PID ${details.pid})`) : "";
        const content =
          theme.fg("success", theme.bold("nvim ")) +
          theme.fg("muted", "connected") +
          pid;
        box.addChild(new Text(content, 0, 0));
        return box;
      }

      case "disconnected": {
        const content =
          theme.fg("warning", theme.bold("nvim ")) +
          theme.fg("muted", "disconnected");
        box.addChild(new Text(content, 0, 0));
        return box;
      }

      case "multiple": {
        const content =
          theme.fg("warning", theme.bold("nvim ")) +
          theme.fg(
            "muted",
            `${details.instanceCount ?? "multiple"} instances found, none selected`,
          );
        box.addChild(new Text(content, 0, 0));
        return box;
      }

      case "none": {
        const content =
          theme.fg("dim", theme.bold("nvim ")) +
          theme.fg("dim", "no instance found");
        box.addChild(new Text(content, 0, 0));
        return box;
      }

      default: {
        box.addChild(new Text(theme.fg("dim", message.content), 0, 0));
        return box;
      }
    }
  });
}
