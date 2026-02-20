import {
  FuzzySelector,
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import {
  type ExtensionAPI,
  getSettingsListTheme,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  type ResolvedSubagentsConfig,
  SUBAGENT_NAMES,
  SUPPORTED_PROVIDERS,
  type SubagentName,
  type SubagentsConfig,
  type SupportedProvider,
} from "../config";

const SUBAGENT_UI: Record<
  SubagentName,
  { label: string; description: string }
> = {
  scout: {
    label: "Scout",
    description: "Web research and GitHub codebase exploration",
  },
  lookout: {
    label: "Lookout",
    description: "Local codebase search by functionality/concept",
  },
  oracle: {
    label: "Oracle",
    description: "Expert AI advisor for complex reasoning",
  },
  reviewer: {
    label: "Reviewer",
    description: "Code review feedback on diffs",
  },
  jester: {
    label: "Jester",
    description: "Random data generator",
  },
  worker: {
    label: "Worker",
    description:
      "Focused implementation agent with mandatory lint/typecheck/test verification",
  },
};

/**
 * Get available model IDs for a provider from the model registry.
 */
function getModelsForProvider(
  registry: ModelRegistry | null,
  provider: SupportedProvider,
): string[] {
  if (!registry) return [];
  return registry
    .getAvailable()
    .filter((m) => m.provider === provider)
    .map((m) => m.id);
}

/**
 * Shared reference to the model registry, captured at session start.
 * Needed because buildSections doesn't receive ExtensionContext.
 */
let registry: ModelRegistry | null = null;

export function registerSubagentsSettings(pi: ExtensionAPI): void {
  // Capture model registry at session start so buildSections can query models.
  pi.on("session_start", async (_event, ctx) => {
    registry = ctx.modelRegistry;
  });

  registerSettingsCommand<SubagentsConfig, ResolvedSubagentsConfig>(pi, {
    commandName: "subagents:settings",
    commandDescription: "Configure subagent providers and models",
    title: "Subagents Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: SubagentsConfig | null,
      resolved: ResolvedSubagentsConfig,
    ): SettingsSection[] => {
      const generalSection: SettingsSection = {
        label: "General",
        items: [
          {
            id: "debug",
            label: "Debug logging",
            description:
              "Write raw events to debug.jsonl for each subagent run",
            currentValue:
              (tabConfig?.debug ?? resolved.debug) ? "enabled" : "disabled",
            values: ["enabled", "disabled"],
          },
        ],
      };

      const subagentSections = SUBAGENT_NAMES.map((name) => {
        const ui = SUBAGENT_UI[name];
        const currentProvider = (tabConfig?.subagents?.[name]?.provider ??
          resolved.subagents[name].provider) as SupportedProvider;
        const currentModel =
          tabConfig?.subagents?.[name]?.model ?? resolved.subagents[name].model;

        const modelValues = getModelsForProvider(registry, currentProvider);

        // Ensure current model is in the list even if not available
        if (!modelValues.includes(currentModel)) {
          modelValues.unshift(currentModel);
        }

        const currentEnabled =
          tabConfig?.subagents?.[name]?.enabled ??
          resolved.subagents[name].enabled;

        return {
          label: `${ui.label} - ${ui.description}`,
          items: [
            {
              id: `subagents.${name}.enabled`,
              label: "Enabled",
              description: `Enable or disable ${ui.label}`,
              currentValue: currentEnabled ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
            {
              id: `subagents.${name}.provider`,
              label: "Provider",
              description: `Provider for ${ui.label}`,
              currentValue: currentProvider,
              values: [...SUPPORTED_PROVIDERS],
            },
            {
              id: `subagents.${name}.model`,
              label: "Model",
              description: `Model for ${ui.label}`,
              currentValue: currentModel,
              submenu: (currentValue: string, done: (v?: string) => void) =>
                new FuzzySelector({
                  label: `Select model for ${ui.label}`,
                  items: modelValues,
                  currentValue,
                  theme: getSettingsListTheme(),
                  onSelect: (value) => done(value),
                  onDone: () => done(),
                }),
            },
          ],
        };
      });

      return [generalSection, ...subagentSections];
    },
    onSettingChange: (
      id: string,
      newValue: string,
      config: SubagentsConfig,
    ): SubagentsConfig | null => {
      const updated = structuredClone(config);

      if (id === "debug") {
        updated.debug = newValue === "enabled";
        return updated;
      }

      if (!updated.subagents) updated.subagents = {};

      const parts = id.split(".");
      if (parts.length !== 3 || parts[0] !== "subagents") return null;
      const name = parts[1] as SubagentName;
      const field = parts[2] as "provider" | "model" | "enabled";

      const existing = updated.subagents[name] ?? {};
      updated.subagents[name] = existing;

      if (field === "enabled") {
        existing.enabled = newValue === "enabled";
      } else if (field === "provider") {
        const newProvider = newValue as SupportedProvider;
        existing.provider = newProvider;
        // Reset model to first available for the new provider
        const models = getModelsForProvider(registry, newProvider);
        existing.model = models[0] ?? "";
      } else {
        existing[field] = newValue;
      }

      return updated;
    },
  });
}
