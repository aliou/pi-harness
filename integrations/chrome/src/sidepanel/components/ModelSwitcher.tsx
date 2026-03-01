import { useEffect, useMemo, useState } from "react";
import type { AvailableModel, ModelInfo } from "../types";

interface ModelSwitcherProps {
  currentModel: ModelInfo | null;
  models: AvailableModel[];
  loading: boolean;
  onRefresh: () => void;
  onSwitch: (provider: string, id: string) => void;
  disabled?: boolean;
}

export function ModelSwitcher({
  currentModel,
  models,
  loading,
  onRefresh,
  onSwitch,
  disabled,
}: ModelSwitcherProps) {
  const providers = useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models],
  );

  const [selectedProvider, setSelectedProvider] = useState("");

  useEffect(() => {
    if (currentModel?.provider) {
      setSelectedProvider(currentModel.provider);
      return;
    }
    if (!selectedProvider && providers.length > 0) {
      setSelectedProvider(providers[0]);
    }
  }, [currentModel?.provider, providers, selectedProvider]);

  const providerModels = useMemo(
    () => models.filter((m) => m.provider === selectedProvider),
    [models, selectedProvider],
  );

  const selectedModelId =
    currentModel?.provider === selectedProvider ? currentModel.id : "";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-2 grid gap-2 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-700 dark:text-zinc-300">Model</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || loading}
          className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          disabled={disabled || loading || providers.length === 0}
          className="min-w-0 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="" disabled>
            {loading ? "Loading providers..." : "Provider"}
          </option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>

        <select
          value={selectedModelId}
          onChange={(e) => {
            if (!selectedProvider || !e.target.value) return;
            onSwitch(selectedProvider, e.target.value);
          }}
          disabled={
            disabled ||
            loading ||
            !selectedProvider ||
            providerModels.length === 0
          }
          className="min-w-0 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="" disabled>
            {selectedProvider ? "Model" : "Select provider"}
          </option>
          {providerModels.map((model) => (
            <option key={`${model.provider}/${model.id}`} value={model.id}>
              {model.displayName || model.id}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
