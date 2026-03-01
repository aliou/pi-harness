import type { BridgeStatusState } from "@/common/constants";

interface ConnectionStatusProps {
  isConnected: boolean;
  bridgeStatus: BridgeStatusState;
  error?: string;
  reconnectAttempt?: number;
  reconnectMax?: number;
  canRetry?: boolean;
  onRetry?: () => void;
}

export function ConnectionStatus({
  isConnected,
  bridgeStatus,
  error,
  reconnectAttempt,
  reconnectMax,
  canRetry,
  onRetry,
}: ConnectionStatusProps) {
  if (isConnected && !error) {
    return (
      <div className="flex items-center gap-1.5 px-1 py-0.5 self-start">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[11px] text-zinc-400">Connected</span>
      </div>
    );
  }

  const label =
    bridgeStatus === "disconnected" ? "Connecting..." : "Disconnected";

  const tone =
    bridgeStatus === "disconnected"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div
      className={`rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-2 ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
      <span>{label}</span>
      {typeof reconnectAttempt === "number" &&
      typeof reconnectMax === "number" &&
      reconnectAttempt > 0 ? (
        <span className="opacity-75">({reconnectAttempt}/{reconnectMax})</span>
      ) : null}
      {error ? <span className="opacity-75 truncate ml-1">{error}</span> : null}
      {canRetry && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto rounded border border-current/35 px-2 py-0.5"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
