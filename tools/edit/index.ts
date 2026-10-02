/**
 * Model-aware edit tool.
 *
 * Registers two edit interfaces and activates the right one per model:
 *
 *   - `apply_patch` (V4A freeform patch) for Codex / GPT-style models, which
 *     were post-trained on that format. It replaces `edit` and `write` for
 *     those models (apply_patch's Add File covers creation).
 *   - `edit` (Kimi old_string/new_string schema) for Kimi K2.7 Code.
 *   - `edit` (native JSON edits[].oldText schema) for everyone else, including
 *     Anthropic and GLM. For Anthropic models, strict tool-use validation is
 *     enabled on the `edit` tool via `before_provider_request`.
 *
 * Routing runs on `session_start`, `model_select`, and `agent_start` (the last
 * is a backstop for startup-before-model-select). The active-tool set is swapped
 * in place with `pi.setActiveTools`, mirroring the `look_at` tool's pattern.
 *
 * File layout (per AGENTS.md): all `pi.*` / `ctx.*` calls live here. Pure logic
 * is in `router.ts`, `default/edit.ts`, `anthropic/strict.ts`, and `apply-patch/*`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  NVIM_UNDO_REGISTER_TOOL_EVENT,
  NVIM_UNDO_REQUEST_TOOLS_EVENT,
} from "@harness/events";
import {
  type BranchEntryLike,
  effectiveModelIdentity,
  type ModelIdentity,
} from "@harness/models";
import { enableStrictOnEditTool } from "./anthropic/strict";
import { createApplyPatchToolDefinition } from "./apply-patch/tool";
import { resolveApplyPatch } from "./apply-patch/undo";
import { createDefaultEditToolDefinition } from "./default/edit";
import { createKimiEditToolDefinition } from "./kimi/edit";
import {
  type EditToolChoice,
  isAnthropicModel,
  pickEditTool,
  resolveActiveTools,
} from "./router";

export { prepareEditArguments, sanitizeArguments } from "./default/edit";

let currentChoice: EditToolChoice | null = null;
let removedByUs: string[] = [];

function registerEditDefinition(
  pi: ExtensionAPI,
  desired: EditToolChoice,
): void {
  if (desired === "kimi_edit") {
    pi.registerTool(createKimiEditToolDefinition(process.cwd()));
    return;
  }
  if (desired === "edit") {
    pi.registerTool(createDefaultEditToolDefinition(process.cwd()));
  }
}

/**
 * Swap the active edit interface to match the active model. Under a virtual
 * (alias) selection the rules apply to the routed physical model; an alias
 * that never answered on this branch leaves the interface as it is.
 */
function routeEditTool(
  pi: ExtensionAPI,
  model: (ModelIdentity & { api?: string }) | undefined,
  branch: readonly BranchEntryLike[],
): void {
  const identity = effectiveModelIdentity(model, branch);
  if (!identity) return;
  const desired = pickEditTool(identity);
  if (desired === currentChoice) return;

  registerEditDefinition(pi, desired);
  const { active, removedByUs: nextRemoved } = resolveActiveTools(
    pi.getActiveTools(),
    desired,
    removedByUs,
  );
  pi.setActiveTools(active);
  removedByUs = nextRemoved;
  currentChoice = desired;
}

export default function editTool(pi: ExtensionAPI): void {
  currentChoice = null;
  removedByUs = [];

  // Register default `edit` (JSON) + Codex `apply_patch` (V4A). Routing can
  // later overwrite `edit` with Kimi's old_string/new_string schema.
  pi.registerTool(createDefaultEditToolDefinition(process.cwd()));
  pi.registerTool(createApplyPatchToolDefinition(process.cwd()));

  // Teach nvim-pi's undo extension how to resolve paths from ``apply_path`
  const registerApplyPatchUndoHandle = () => {
    pi.events.emit(NVIM_UNDO_REGISTER_TOOL_EVENT, {
      toolName: "apply_patch",
      resolvePaths: resolveApplyPatch,
    });
  };

  // Dispatch our registration incase we're late + wait for the request, incase we're early.
  registerApplyPatchUndoHandle();
  pi.events.on(NVIM_UNDO_REQUEST_TOOLS_EVENT, registerApplyPatchUndoHandle);

  pi.on("session_start", (_event, ctx) => {
    routeEditTool(pi, ctx.model, ctx.sessionManager.getBranch());
  });

  pi.on("model_select", (event, ctx) => {
    routeEditTool(pi, event.model, ctx.sessionManager.getBranch());
  });

  // Backstop: ensure routing is correct before the first turn even if
  // `session_start` ran before a model was selected.
  pi.on("agent_start", (_event, ctx) => {
    routeEditTool(pi, ctx.model, ctx.sessionManager.getBranch());
  });

  // Anthropic strict tool-use: grammar-constrain the `edit` tool's output so
  // the model cannot emit malformed edit arguments. The hook tightens the
  // edit tool's `input_schema` (sets `additionalProperties: false` and a
  // complete `required` list on every object node) and sets `strict: true` on
  // the wire payload only, leaving the registered schema non-strict so other
  // providers keep tolerating stray keys (upstream pi #5501). Routing (above)
  // always selects the `edit` interface for Anthropic models, so the tool set
  // already contains `edit` when this fires.
  pi.on("before_provider_request", (event, ctx) => {
    const identity = effectiveModelIdentity(
      ctx.model,
      ctx.sessionManager.getBranch(),
    );
    if (!isAnthropicModel(identity)) return;
    return enableStrictOnEditTool(event.payload);
  });
}
