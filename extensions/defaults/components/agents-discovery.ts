import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

export const AGENTS_DISCOVERY_MESSAGE_TYPE = "ad:agents-discovery";

export interface AgentsDiscoveryDetails {
  files: string[];
}

export function registerAgentsDiscoveryRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer<AgentsDiscoveryDetails>(
    AGENTS_DISCOVERY_MESSAGE_TYPE,
    (message, _options, theme) => {
      const details = message.details;
      if (!details?.files.length) return undefined;

      const lines: string[] = [];
      lines.push(theme.fg("muted", "Loaded subdirectory context:"));
      for (const file of details.files) {
        lines.push(`  ${theme.fg("success", file)}`);
      }

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(lines.join("\n"), 0, 0));
      return box;
    },
  );
}
