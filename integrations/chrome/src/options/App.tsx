import { ModelSwitcher } from "@/sidepanel/components/ModelSwitcher";
import { usePiAgent } from "@/sidepanel/hooks/use-pi-agent";

export default function App() {
  const agent = usePiAgent();

  return (
    <main className="min-h-screen bg-white text-zinc-900 p-5 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-xl rounded-xl border border-zinc-200 bg-zinc-50 p-4 grid gap-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-lg font-semibold">Pi Chrome Settings</h1>
          <p className="text-sm text-zinc-500 mt-1 dark:text-zinc-400">Model selection.</p>
        </div>

        <ModelSwitcher
          currentModel={agent.currentModel}
          models={agent.availableModels}
          loading={false}
          onRefresh={agent.refreshModels}
          onSwitch={agent.setModel}
          disabled={!agent.isConnected || agent.isStreaming}
        />
      </div>
    </main>
  );
}
