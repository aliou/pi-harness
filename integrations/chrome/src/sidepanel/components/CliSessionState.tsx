import type { SessionStats } from "../types";

interface CliSessionStateProps {
  stats: SessionStats | null;
  compacting?: boolean;
}

function fmtNum(value?: number): string {
  if (typeof value !== "number") return "--";
  if (value < 1_000) return `${value}`;
  if (value < 1_000_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function fmtCost(value?: number): string {
  if (typeof value !== "number") return "--";
  return value.toFixed(3);
}

function fmtPct(value?: number): string {
  if (typeof value !== "number") return "--";
  return `${value.toFixed(1)}%`;
}

export function CliSessionState({ stats, compacting }: CliSessionStateProps) {
  return (
    <div className="text-[10px] text-zinc-500 font-mono truncate dark:text-zinc-400">
      <span>↑{fmtNum(stats?.tokens.input)} </span>
      <span>↓{fmtNum(stats?.tokens.output)} </span>
      <span>R{fmtNum(stats?.tokens.cacheRead)} </span>
      <span>${fmtCost(stats?.cost)} </span>
      {typeof stats?.contextPercent === "number" &&
      typeof stats?.contextWindow === "number" ? (
        <span>
          {fmtPct(stats.contextPercent)}/{fmtNum(stats.contextWindow)}{" "}
        </span>
      ) : null}
      {compacting ? <span>compacting</span> : null}
    </div>
  );
}
