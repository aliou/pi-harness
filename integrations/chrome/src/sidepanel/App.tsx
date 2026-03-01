import { ClockCounterClockwise, Gear, Plus } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { CliSessionState } from "./components/CliSessionState";
import { ExtensionUI } from "./components/ExtensionUI";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { MessageList } from "./components/MessageList";
import { NotificationStack } from "./components/Notification";
import { StatusBar } from "./components/StatusBar";
import { WidgetBlock } from "./components/Widget";
import { usePiAgent } from "./hooks/use-pi-agent";

export default function App() {
  const agent = usePiAgent();
  const [showSessions, setShowSessions] = useState(false);

  const openSettings = () => {
    void chrome.runtime.openOptionsPage();
  };

  useEffect(() => {
    if (!showSessions) return;
    agent.listSessions();
  }, [showSessions, agent.listSessions]);

  const hasMessages =
    agent.messages.length > 0 ||
    (agent.messageCount ?? 0) > 0 ||
    (agent.pendingMessageCount ?? 0) > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta || !event.shiftKey) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (hasMessages) {
          agent.newSession();
        }
      }

      if (event.key.toLowerCase() === ",") {
        event.preventDefault();
        openSettings();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [agent, hasMessages]);

  const modelLabel = useMemo(() => {
    if (!agent.currentModel) return "no-model";
    return `${agent.currentModel.provider}/${agent.currentModel.id}`;
  }, [agent.currentModel]);

  return (
    <main className="h-screen flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="relative px-4 py-2 text-sm border-b border-zinc-200 bg-zinc-50 flex items-center gap-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span
          className={`h-2 w-2 rounded-full ${agent.isConnected ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <span className="text-zinc-700 dark:text-zinc-300">
          {agent.isConnected ? "Connected" : "Disconnected"}
        </span>
        <span className="hidden sm:inline text-zinc-400 dark:text-zinc-500">·</span>
        <span className="hidden sm:inline font-mono text-xs text-zinc-500 truncate dark:text-zinc-400">
          {modelLabel}
        </span>
        <button
          type="button"
          onClick={agent.cycleThinkingLevel}
          className="hidden md:inline font-mono text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          title="Reasoning level"
        >
          {agent.thinkingLevel ?? "medium"}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={agent.newSession}
            disabled={!hasMessages}
            title="New session (Cmd/Ctrl+Shift+N)"
            className="flex items-center justify-center p-1 rounded w-6 h-6 text-zinc-500 hover:bg-zinc-100 transition-colors disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="New session"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShowSessions((prev) => !prev)}
            title="Resume session"
            className="flex items-center justify-center p-1 rounded w-6 h-6 text-zinc-500 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Resume session"
          >
            <ClockCounterClockwise size={16} />
          </button>
          <button
            type="button"
            onClick={openSettings}
            title="Settings (Cmd/Ctrl+Shift+,)"
            className="flex items-center justify-center p-1 rounded w-6 h-6 text-zinc-500 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Settings"
          >
            <Gear size={16} />
          </button>
        </div>

        {showSessions ? (
          <div className="absolute right-2 top-9 z-20 w-[19rem] max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {agent.isLoadingSessions ? (
              <p className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Loading sessions...
              </p>
            ) : agent.sessions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                No sessions.
              </p>
            ) : (
              <ul className="grid gap-1">
                {agent.sessions.map((session) => {
                  const active = session.sessionPath === agent.sessionFile;
                  return (
                    <li key={session.sessionPath}>
                      <button
                        type="button"
                        disabled={active}
                        onClick={() => {
                          agent.switchSession(session.sessionPath);
                          setShowSessions(false);
                        }}
                        className="w-full rounded px-2 py-1.5 text-left text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                          {session.sessionName || "Untitled session"}
                        </div>
                        <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          {session.messageCount ?? 0} msgs
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto relative">
        <MessageList messages={agent.messages} />
      </div>

      <div className="p-2 mb-2 flex flex-col gap-2">
        <WidgetBlock widgets={agent.widgets} placement="aboveEditor" />
        <StatusBar entries={agent.statusEntries} />
        <LoadingIndicator isLoading={agent.isStreaming} />
        <ChatInput
          onSend={agent.sendPrompt}
          onAbort={agent.abort}
          isStreaming={agent.isStreaming}
          disabled={!agent.isConnected}
          prefill={agent.editorPrefill}
          onPrefillConsumed={agent.clearEditorPrefill}
        />
        <CliSessionState
          stats={agent.sessionStats}
          compacting={agent.isCompacting}
        />
        <WidgetBlock widgets={agent.widgets} placement="belowEditor" />
      </div>

      <ExtensionUI
        dialog={agent.activeDialog}
        onRespond={agent.respondToDialog}
      />
      <NotificationStack
        notifications={agent.notifications}
        onDismiss={agent.dismissNotification}
      />
    </main>
  );
}
