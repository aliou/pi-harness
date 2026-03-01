import { ModelSwitcher } from "./ModelSwitcher";
import type { AvailableModel, ModelInfo } from "../types";

interface SettingsPanelProps {
  currentModel: ModelInfo | null;
  models: AvailableModel[];
  disabled?: boolean;
  onRefreshModels: () => void;
  onSetModel: (provider: string, id: string) => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <section className="flex-1 rounded-xl border border-zinc-200 bg-white p-3 grid content-start gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800">Settings</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Model selection.</p>
      </div>

      <ModelSwitcher
        currentModel={props.currentModel}
        models={props.models}
        loading={false}
        onRefresh={props.onRefreshModels}
        onSwitch={props.onSetModel}
        disabled={props.disabled}
      />
    </section>
  );
}
