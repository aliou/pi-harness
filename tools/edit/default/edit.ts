/**
 * Default `edit` tool override.
 *
 * Wraps Pi's native edit tool only to tolerate stray empty-string entries in
 * the `edits` array (some models occasionally emit `""` inside `edits`, which
 * fails schema validation before the native tool can run). Strips those
 * entries in `prepareArguments`, then delegates to the native edit tool
 * unchanged -- including the native renderer, which streams a live diff
 * preview as the model streams edit arguments (before `execute` runs).
 *
 * This is the edit interface used for non-Codex, non-Kimi models (Anthropic,
 * GLM, and the rest). For Anthropic models, strict tool-use validation is
 * layered on the outgoing request via the `before_provider_request` hook in
 * `index.ts` (see `anthropic/strict.ts`), which tightens the edit tool's
 * `input_schema` and sets `strict: true` on the wire payload only.
 */

import type { EditToolInput } from "@earendil-works/pi-coding-agent";
import { createEditToolDefinition } from "@earendil-works/pi-coding-agent";

export function sanitizeArguments(args: unknown): EditToolInput {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return args as EditToolInput;
  }

  const rawArgs = args as {
    path?: unknown;
    edits?: unknown;
  };

  if (!Array.isArray(rawArgs.edits)) {
    return rawArgs as EditToolInput;
  }

  return {
    ...rawArgs,
    edits: rawArgs.edits.filter((edit) => edit !== ""),
  } as EditToolInput;
}

export function prepareEditArguments(
  args: unknown,
  nativePrepareArguments?: (args: EditToolInput) => EditToolInput,
): EditToolInput {
  const sanitizedArgs = sanitizeArguments(args);

  return nativePrepareArguments
    ? nativePrepareArguments(sanitizedArgs)
    : sanitizedArgs;
}

/**
 * Register the default `edit` tool (wrapping the native definition). The native
 * definition is created relative to `cwd` so path resolution matches Pi core.
 * Only `prepareArguments` is overridden; the native `renderShell` /
 * `renderCall` / `renderResult` are kept so the native tool streams its live
 * arg-time diff preview without the harness reimplementing edit-diff logic.
 */
export function createDefaultEditToolDefinition(
  cwd: string,
): ReturnType<typeof createEditToolDefinition> {
  const nativeEdit = createEditToolDefinition(cwd);

  return {
    ...nativeEdit,
    // Strict edit validation is layered on the Anthropic wire payload via the
    // `before_provider_request` hook (see `anthropic/strict.ts`), not via
    // provider-side constrained sampling. Disable the native default so the
    // registered schema stays non-strict for other providers (pi #5501).
    constrainedSampling: false,
    prepareArguments(args: unknown) {
      return prepareEditArguments(args, nativeEdit.prepareArguments);
    },
  };
}
