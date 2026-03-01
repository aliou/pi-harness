import type { SessionStats as SessionStatsData } from "../types";

interface SessionStatsProps {
  stats: SessionStatsData | null;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  compacting?: boolean;
  compactionSummary?: string;
  disabled?: boolean;
}

function formatCost(cost: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

export function SessionStats({
  stats,
  loading,
  error,
  onRefresh,
  compacting,
  compactionSummary,
  disabled,
}: SessionStatsProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-700 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">Session stats</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || disabled}
          className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {compacting ? (
        <p className="text-amber-700">Compacting conversation...</p>
      ) : null}
      {!compacting && compactionSummary ? (
        <p className="text-zinc-500">{compactionSummary}</p>
      ) : null}

      {error ? (
        <p className="text-rose-600">{error}</p>
      ) : loading ? (
        <p className="text-zinc-500">Loading stats...</p>
      ) : !stats ? (
        <p className="text-zinc-500">No stats yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span>Total msgs</span>
          <span className="text-right">{stats.totalMessages}</span>
          <span>Input tokens</span>
          <span className="text-right">{stats.tokens.input}</span>
          <span>Output tokens</span>
          <span className="text-right">{stats.tokens.output}</span>
          <span>Cache read</span>
          <span className="text-right">{stats.tokens.cacheRead}</span>
          <span>Cache write</span>
          <span className="text-right">{stats.tokens.cacheWrite}</span>
          <span>Cost</span>
          <span className="text-right">{formatCost(stats.cost)}</span>
        </div>
      )}
    </section>
  );
}
