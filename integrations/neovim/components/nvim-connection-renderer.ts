import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface NvimConnectionDetails {
  status: "connected" | "disconnected" | "multiple" | "none";
  pid?: number;
  socket?: string;
  instanceCount?: number;
}

export function registerNvimConnectionRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer("nvim-connection", (message, _options, theme) => {
    const details = message.details as NvimConnectionDetails | undefined;

    if (!details) {
      return theme.fg("dim", message.content);
    }

    switch (details.status) {
      case "connected": {
        const pid = details.pid ? theme.fg("dim", ` (PID ${details.pid})`) : "";
        return (
          theme.fg("success", theme.bold("nvim ")) +
          theme.fg("muted", "connected") +
          pid
        );
      }

      case "disconnected":
        return (
          theme.fg("warning", theme.bold("nvim ")) +
          theme.fg("muted", "disconnected")
        );

      case "multiple":
        return (
          theme.fg("warning", theme.bold("nvim ")) +
          theme.fg(
            "muted",
            `${details.instanceCount ?? "multiple"} instances found, none selected`,
          )
        );

      case "none":
        return (
          theme.fg("dim", theme.bold("nvim ")) +
          theme.fg("dim", "no instance found")
        );

      default:
        return theme.fg("dim", message.content);
    }
  });
}
