import type { StatusEntry } from "../types";

interface StatusBarProps {
  entries: StatusEntry[];
}

export function StatusBar({ entries }: StatusBarProps) {
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-2 py-1 bg-zinc-50 rounded border border-zinc-200 text-xs text-zinc-600 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">
      {entries.map((entry) => (
        <span key={entry.key} className="px-1.5 py-0.5 bg-zinc-100 rounded dark:bg-zinc-800">
          {entry.text}
        </span>
      ))}
    </div>
  );
}
