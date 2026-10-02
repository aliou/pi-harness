import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { isVirtualModel } from "@harness/models";

export { isVirtualModel };

const THINKING_LEVEL_COLOR_MAP: Record<string, ThemeColor> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

function thinkingLevelToColorToken(level: string): ThemeColor {
  return THINKING_LEVEL_COLOR_MAP[level] ?? "thinkingMinimal";
}

interface BranchEntryLike {
  type: string;
  message?: {
    role?: string;
    provider?: string;
    model?: string;
    stopReason?: string;
  };
}

export interface RoutedModel {
  provider: string;
  modelId: string;
}

/**
 * Model that answered since the virtual model (an alias) was selected. Like
 * Pi's `AgentSession.routedModel`, failed and aborted responses are skipped.
 * Unlike it, responses before the latest `model_change` do not count, so a
 * fresh switch shows no routed model instead of the previous one.
 */
export function findRoutedModel(
  selected: { api: string } | undefined,
  branch: readonly BranchEntryLike[],
): RoutedModel | undefined {
  if (!isVirtualModel(selected)) return undefined;
  for (const { type, message } of [...branch].reverse()) {
    if (type === "model_change") return undefined;
    if (isSuccessfulResponse(message)) {
      return { provider: message.provider, modelId: message.model };
    }
  }
  return undefined;
}

function isSuccessfulResponse(
  message: BranchEntryLike["message"],
): message is { provider: string; model: string } {
  if (message?.role !== "assistant") return false;
  return message.stopReason !== "error" && message.stopReason !== "aborted";
}

/** Drop gateway qualifiers such as `anthropic-oauth/` and `hf:org/`. */
function baseModelId(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf("/") + 1);
}

/**
 * `kimi-k3`, or `neuralwatt/kimi-k3` when another available provider serves a
 * model with the same id (ignoring case and gateway qualifiers).
 */
export function formatRoutedModel(
  routed: RoutedModel,
  available: readonly { provider: string; id: string }[],
): string {
  const id = baseModelId(routed.modelId);
  const key = id.toLowerCase();
  const providers = new Set(
    available
      .filter((model) => baseModelId(model.id).toLowerCase() === key)
      .map((model) => model.provider),
  );
  return providers.size > 1 ? `${routed.provider}/${id}` : id;
}

/**
 * Build model line for footer line 2 right side. A routed model id renders as
 * `alias/claude-opus → claude-opus-5-5:hig`.
 */
export function buildModelLine(
  theme: Theme,
  provider: string | undefined,
  modelId: string | undefined,
  hasReasoning: boolean,
  thinkingLevel: string,
  routedModelId?: string,
): string {
  const providerName = provider ?? "unknown";
  const routed = routedModelId ? ` → ${routedModelId}` : "";
  const modelPart = `${providerName}/${modelId ?? "no-model"}${routed}:`;

  if (hasReasoning) {
    const formattedLevel =
      thinkingLevel !== "off"
        ? thinkingLevel.slice(0, 3) // min, med, max
        : "off";
    const thinkingColorToken = thinkingLevelToColorToken(thinkingLevel);
    return (
      theme.fg("thinkingMinimal", modelPart) +
      theme.fg(thinkingColorToken, formattedLevel)
    );
  }

  return (
    theme.fg("thinkingMinimal", modelPart) + theme.fg("thinkingOff", "none")
  );
}

/**
 * Build model ID only (no provider, no thinking level)
 */
export function buildModelIdLine(
  theme: Theme,
  modelId: string | undefined,
): string {
  return theme.fg("thinkingMinimal", modelId ?? "no-model");
}
