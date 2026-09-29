/**
 * Model-aware routing for the edit tool family.
 *
 * Pure predicates and a routing decision. All `pi.*` side effects live in
 * `index.ts`; this module only decides which edit interface a model should use
 * based on its provider / id.
 */

type ModelLike = { provider?: string; id?: string } | undefined;

/**
 * Codex / GPT-style models were post-trained on the V4A `apply_patch` format.
 *
 * Pi's `openai` provider uses this interface for GPT-5/6 models. The
 * compatibility `openai-codex` provider is Codex-only. Other OpenAI models
 * and GPT ids on proxies keep edit/write.
 */
export function isCodexModel(model: ModelLike): boolean {
  if (model?.provider === "openai-codex") return true;
  if (model?.provider !== "openai") return false;
  return /^gpt-(?:5|6)(?:[.-]|$)/i.test(model.id ?? "");
}

/** Anthropic Claude models benefit from strict tool-use schema validation. */
export function isAnthropicModel(model: ModelLike): boolean {
  return model?.provider === "anthropic";
}

/** Kimi K2.7 Code is tuned for Moonshot's old_string/new_string edit shape. */
export function isKimiCodeModel(model: ModelLike): boolean {
  const id = model?.id?.toLowerCase();
  return (
    (model?.provider === "neuralwatt" && id === "kimi-k2.7-code") ||
    (model?.provider === "synthetic" && id === "hf:moonshotai/kimi-k2.7-code")
  );
}

export type EditToolChoice = "apply_patch" | "edit" | "kimi_edit";

/** Which edit interface the active model should use. */
export function pickEditTool(model: ModelLike): EditToolChoice {
  if (isCodexModel(model)) return "apply_patch";
  if (isKimiCodeModel(model)) return "kimi_edit";
  return "edit";
}

/**
 * Compute the next active-tool set for an edit-interface swap.
 *
 * - `apply_patch` (Codex): drop `edit` and `write` (apply_patch's Add File
 *   covers creation), add `apply_patch`. `removedByUs` records what was dropped
 *   so it can be restored on exit.
 * - `edit` / `kimi_edit`: drop `apply_patch`, restore previously-removed
 *   tools, and ensure `edit` is present. The public tool name is still `edit`;
 *   `index.ts` swaps the registered definition for Kimi.
 *
 * Pure: `index.ts` owns the `currentChoice` / `removedByUs` state and the
 * `pi.setActiveTools` side effect.
 */
export function resolveActiveTools(
  active: string[],
  desired: EditToolChoice,
  removedByUs: string[],
): { active: string[]; removedByUs: string[] } {
  if (desired === "apply_patch") {
    const removed: string[] = [];
    const next = active.filter((t) => {
      if (t === "edit" || t === "write") {
        removed.push(t);
        return false;
      }
      return true;
    });
    const withPatch = next.includes("apply_patch")
      ? next
      : [...next, "apply_patch"];
    return { active: withPatch, removedByUs: removed };
  }

  let next = active.filter((t) => t !== "apply_patch");
  for (const t of removedByUs) {
    if (!next.includes(t)) next = [...next, t];
  }
  if (!next.includes("edit")) next = [...next, "edit"];
  return { active: next, removedByUs: [] };
}
