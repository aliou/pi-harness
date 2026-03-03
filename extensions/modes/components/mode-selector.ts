import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
  getSelectListTheme,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from "@mariozechner/pi-tui";
import { MODE_ORDER, MODES } from "../modes";
import { getCurrentMode } from "../state";

function modeDescription(name: string): string {
  if (name === "default") return "No restrictions";
  return "Read-only research mode (read + grep/find/ls only)";
}

export async function showModeSelector(
  _pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<string | null> {
  const current = getCurrentMode().name;

  if (!ctx.hasUI) {
    const labels = MODE_ORDER.map((name) =>
      name === current ? `- ${name} (active)` : `- ${name}`,
    );
    console.log(`Available modes:\n${labels.join("\n")}`);
    return null;
  }

  const items: SelectItem[] = MODE_ORDER.map((name) => ({
    value: name,
    label: name === current ? `${name} (active)` : name,
    description: modeDescription(name),
  }));

  const selected = await ctx.ui.custom<string | null>(
    (tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(
        new DynamicBorder((s: string) => theme.fg("accent", s)),
      );
      container.addChild(
        new Text(theme.fg("accent", theme.bold("Select Mode")), 1, 0),
      );
      container.addChild(new Spacer(1));

      const list = new SelectList(
        items,
        Math.min(items.length, 8),
        getSelectListTheme(),
      );
      list.onSelect = (item) => done(item.value);
      list.onCancel = () => done(null);

      const selectedIndex = Math.max(0, MODE_ORDER.indexOf(current));
      list.setSelectedIndex(selectedIndex);

      container.addChild(list);
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg("dim", "↑↓ navigate • enter select • esc cancel"),
          1,
          0,
        ),
      );
      container.addChild(
        new DynamicBorder((s: string) => theme.fg("accent", s)),
      );

      return {
        render: (width: number) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (data: string) => {
          list.handleInput(data);
          tui.requestRender();
        },
      };
    },
  );

  if (selected === undefined) {
    const choice = await ctx.ui.select("Select mode", MODE_ORDER);
    return choice ?? null;
  }

  if (!selected) return null;
  return MODES[selected] ? selected : null;
}
