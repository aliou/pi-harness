import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

interface NvimConnectionDetails {
  status: "connected" | "disconnected" | "multiple" | "none";
  pid?: number;
  socket?: string;
  instanceCount?: number;
}

function renderMessageContent(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (item): item is { type: string; text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

export function registerNvimConnectionRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer("nvim-connection", (message, _options, theme) => {
    const details = message.details as NvimConnectionDetails | undefined;
    const box = new Box(1, 1, (s) => theme.bg("customMessageBg", s));

    const tag = theme.fg("customMessageLabel", theme.bold("[nvim]"));

    if (!details) {
      box.addChild(
        new Text(
          `${tag} ${theme.fg("dim", renderMessageContent(message.content))}`,
          0,
          0,
        ),
      );
      return box;
    }

    switch (details.status) {
      case "connected": {
        const pidInfo = details.pid
          ? theme.fg("dim", ` PID ${details.pid}`)
          : "";
        const content = `${theme.fg("success", "Connected")}${pidInfo}`;
        box.addChild(new Text(`${tag} ${content}`, 0, 0));
        return box;
      }

      case "disconnected": {
        const content = theme.fg("warning", "Disconnected");
        box.addChild(new Text(`${tag} ${content}`, 0, 0));
        return box;
      }

      case "multiple": {
        const count = details.instanceCount ?? "multiple";
        const content = theme.fg(
          "warning",
          `${count} instances found, none selected`,
        );
        box.addChild(new Text(`${tag} ${content}`, 0, 0));
        return box;
      }

      case "none": {
        const content = theme.fg("dim", "No instance found");
        box.addChild(new Text(`${tag} ${content}`, 0, 0));
        return box;
      }

      default: {
        box.addChild(
          new Text(
            `${tag} ${theme.fg("dim", renderMessageContent(message.content))}`,
            0,
            0,
          ),
        );
        return box;
      }
    }
  });
}
