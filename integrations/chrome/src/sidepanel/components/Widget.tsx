import type { WidgetEntry } from "../types";

interface WidgetBlockProps {
  widgets: WidgetEntry[];
  placement: "aboveEditor" | "belowEditor";
}

export function WidgetBlock({ widgets, placement }: WidgetBlockProps) {
  const filtered = widgets.filter((w) => w.placement === placement);
  if (filtered.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {filtered.map((w) => (
        <pre
          key={w.key}
          className="text-xs bg-zinc-50 border border-zinc-200 rounded px-2 py-1 whitespace-pre-wrap text-zinc-700 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
        >
          {w.lines.join("\n")}
        </pre>
      ))}
    </div>
  );
}
