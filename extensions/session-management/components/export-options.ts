import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text } from "@mariozechner/pi-tui";
import type { ExportOptions } from "../lib/markdown-exporter";

interface ToggleItem {
  key: keyof ExportOptions;
  label: string;
}

const ITEMS: ToggleItem[] = [
  { key: "toolCalls", label: "Tool calls" },
  { key: "toolResults", label: "Tool results" },
  { key: "thinking", label: "Thinking blocks" },
];

export async function showExportOptions(
  ctx: ExtensionCommandContext,
): Promise<ExportOptions | null> {
  return ctx.ui.custom<ExportOptions | null>((_tui, theme, _kb, done) => {
    let selectedIndex = 0;
    const state: ExportOptions = {
      toolCalls: true,
      toolResults: true,
      thinking: false,
    };

    const container = new Container();
    const border = (s: string) => theme.fg("accent", s);

    container.addChild(new DynamicBorder(border));
    container.addChild(
      new Text(theme.bold("Export Session to Markdown"), 1, 0),
    );
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg("dim", "Include (space to toggle)"), 1, 0),
    );
    container.addChild(new Spacer(1));

    const itemTexts: Text[] = ITEMS.map(() => new Text("", 1, 0));
    for (const t of itemTexts) {
      container.addChild(t);
    }

    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg("dim", "up/down navigate  space toggle  enter ok  esc cancel"),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder(border));

    function updateItems() {
      for (const [i, item] of ITEMS.entries()) {
        const checked = state[item.key] ? "x" : " ";
        const prefix = i === selectedIndex ? "> " : "  ";
        const label = `${prefix}[${checked}] ${item.label}`;
        const styled =
          i === selectedIndex
            ? theme.fg("text", label)
            : theme.fg("dim", label);
        itemTexts[i]?.setText(styled);
      }
    }

    updateItems();

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, Key.escape)) {
          done(null);
        } else if (matchesKey(data, Key.enter)) {
          done(state);
        } else if (matchesKey(data, Key.up)) {
          selectedIndex = Math.max(0, selectedIndex - 1);
          updateItems();
        } else if (matchesKey(data, Key.down)) {
          selectedIndex = Math.min(ITEMS.length - 1, selectedIndex + 1);
          updateItems();
        } else if (data === " ") {
          const item = ITEMS[selectedIndex];
          if (item) {
            state[item.key] = !state[item.key];
          }
          updateItems();
        }
      },
    };
  });
}
