import type { SessionSummary } from "../types";

interface SessionPanelProps {
  sessions: SessionSummary[];
  currentSessionPath?: string;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onSwitch: (sessionPath: string) => void;
  onNewSession: () => void;
  disabled?: boolean;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "";
  }
}

export function SessionPanel({
  sessions,
  currentSessionPath,
  loading,
  error,
  onRefresh,
  onSwitch,
  onNewSession,
  disabled,
}: SessionPanelProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-zinc-700">Sessions</h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || disabled}
            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onNewSession}
            disabled={disabled}
            title="Shortcut: Cmd/Ctrl+Shift+N"
            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            New
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : loading ? (
        <p className="text-xs text-zinc-500">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-zinc-500">No sessions yet.</p>
      ) : (
        <ul className="max-h-44 overflow-y-auto grid gap-1">
          {sessions.map((session) => {
            const active = session.sessionPath === currentSessionPath;
            return (
              <li key={session.sessionPath}>
                <button
                  type="button"
                  onClick={() => onSwitch(session.sessionPath)}
                  disabled={disabled || active}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs border ${
                    active
                      ? "border-zinc-800 bg-zinc-100"
                      : "border-zinc-200 hover:border-zinc-300"
                  } disabled:opacity-60`}
                >
                  <div className="font-medium text-zinc-800 truncate">
                    {session.sessionName || "Untitled session"}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {session.messageCount !== undefined
                      ? `${session.messageCount} msgs`
                      : ""}
                    {session.updatedAt ? ` · ${formatDate(session.updatedAt)}` : ""}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
