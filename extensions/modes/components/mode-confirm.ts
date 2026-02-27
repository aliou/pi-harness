import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

export type ConfirmResult = "allow" | "allow-session" | "deny";

export async function showModeConfirmDialog(
  ctx: ExtensionContext,
  modeName: string,
  toolName: string,
  bashCommand?: string,
): Promise<ConfirmResult> {
  const result = await ctx.ui.custom<ConfirmResult>(
    (_tui, theme, _kb, done) => {
      const container = new Container();
      const redBorder = (s: string) => theme.fg("error", s);

      container.addChild(new DynamicBorder(redBorder));
      container.addChild(
        new Text(theme.fg("error", theme.bold("Tool Not in Allowlist")), 1, 0),
      );
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg(
            "warning",
            `The tool ${toolName} is not in the allowlist for ${modeName} mode.`,
          ),
          1,
          0,
        ),
      );

      let commandText: Text | undefined;
      if (bashCommand) {
        container.addChild(new Spacer(1));
        container.addChild(
          new DynamicBorder((s: string) => theme.fg("muted", s)),
        );
        commandText = new Text("", 1, 0);
        container.addChild(commandText);
        container.addChild(
          new DynamicBorder((s: string) => theme.fg("muted", s)),
        );
      }

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg(
            "dim",
            "y/enter: allow | a: allow for session | n/esc: deny",
          ),
          1,
          0,
        ),
      );
      container.addChild(new DynamicBorder(redBorder));

      return {
        render: (width: number) => {
          if (commandText && bashCommand) {
            commandText.setText(
              wrapTextWithAnsi(theme.fg("text", bashCommand), width - 4).join(
                "\n",
              ),
            );
          }
          return container.render(width);
        },
        invalidate: () => container.invalidate(),
        handleInput: (data: string) => {
          if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
            done("allow");
            return;
          }
          if (data === "a" || data === "A") {
            done("allow-session");
            return;
          }
          if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
            done("deny");
          }
        },
      };
    },
  );

  if (result === undefined) return "deny";
  return result;
}
