import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { DEFAULT_MODE, MODES } from "../modes";

export type ModeSwitchDetails = { mode: string; from: string; model?: string };

export function sendModeSwitchMessage(
  pi: ExtensionAPI,
  details: ModeSwitchDetails,
  content: string,
): void {
  pi.sendMessage<ModeSwitchDetails>(
    {
      customType: "mode-switch",
      content,
      display: true,
      details,
    },
    { triggerTurn: false },
  );
}

export function registerModeSwitchRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer<ModeSwitchDetails>(
    "mode-switch",
    (message, _options, theme) => {
      const details = message.details;
      const fromRaw = details?.from ?? "default";
      const toRaw = details?.mode ?? "default";

      const from = MODES[fromRaw]?.name ?? DEFAULT_MODE.name;
      const to = MODES[toRaw]?.name ?? DEFAULT_MODE.name;
      const model =
        typeof details?.model === "string" ? details.model : undefined;

      const tag = theme.fg("customMessageLabel", theme.bold("[Mode]"));
      const fromText = theme.fg("accent", from);
      const toText = theme.fg("accent", to);
      const modelText = model ? theme.fg("muted", ` (${model})`) : "";
      const text = `${theme.fg("muted", "Switch from ")}${fromText}${theme.fg("muted", " to ")}${toText}${modelText}`;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(`${tag} ${text}`, 0, 0));
      return box;
    },
  );
}
