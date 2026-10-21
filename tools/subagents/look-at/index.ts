import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createSubagent } from "@harness/agent-kit";
import { convertBmpToPng } from "@harness/image-formats";
import { resolveEffectiveModel } from "@harness/models";
import { addTools, removeTools } from "../shared/active-tools";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { renderLookAtDetails, renderLookAtHeader } from "./render";
import { LookAtParams, type LookAtParamsInput } from "./types";
import {
  aliasVisionCapable,
  detectSupportedImageMimeType,
  injectLookAtGuidance,
  isVisionCapable,
  visionGateAction,
} from "./utils";

const TOOL_NAME = "look_at";
const TOOL_NAMES = [TOOL_NAME];

function enableTool(pi: ExtensionAPI) {
  const next = addTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

function disableTool(pi: ExtensionAPI) {
  const next = removeTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

/** Creates the production look-at subagent for registration and eval harnesses. */
export function createLookAtSubagent(pi: ExtensionAPI) {
  return createSubagent(pi, {
    name: TOOL_NAME,
    modelPreferences: [
      { provider: "agents", model: TOOL_NAME, thinking: "off" },
    ],
    label: "Look At",
    description: `Analyze an image file using a vision subagent. Returns a text description of the image content.

Use this tool when you need to understand or extract information from an image file (PNG, JPG, GIF, WebP, BMP, etc.). If the current agent cannot see images directly, this tool delegates to a vision-capable subagent.

Always provide a clear objective describing what you want to learn from the image.

## When to use this tool
- Analyzing screenshots, diagrams, charts, or photographs
- Extracting text or error messages from images
- Describing visual content that the Read tool cannot interpret
- Comparing visual elements (use context to describe what to compare)

## When NOT to use this tool
- For source code or plain text files where you need exact contents -- use read instead
- When you need to edit the file afterward
- For simple file reading where no interpretation is needed`,
    promptSnippet:
      "Vision subagent for extracting focused information from screenshots, diagrams, charts, photos, and other image files.",
    promptGuidelines: [
      "look_at: Use when you need to understand or extract information from an image file; do not use for source code or plain text files.",
      "look_at: Provide a specific objective: what visible evidence to inspect, what to ignore, and the desired output format.",
      "look_at: Use context to provide product/code/error background, nearby files, expected UI state, or comparison target.",
      "look_at: Ask for exact visible evidence; for UI screenshots, ask about hierarchy, spacing, affordances, accessibility, and visible text.",
      "look_at: Do not ask it to infer hidden state, behavior, or implementation details beyond what is visible in the image.",
    ],
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    tools: [],
    parameters: LookAtParams,
    renderHeader: renderLookAtHeader,
    renderDetails: renderLookAtDetails,
    async buildPrompt(params, ctx) {
      const absolutePath = resolve(ctx.cwd, params.path);
      const buffer = readFileSync(absolutePath);
      const mimeType = detectSupportedImageMimeType(buffer);
      if (!mimeType)
        throw new Error(`Unsupported image format for ${absolutePath}`);

      const userText = params.context
        ? `Context: ${params.context}\n\nObjective: ${params.objective}`
        : params.objective;

      let imageData = buffer.toString("base64");
      let imageMimeType = mimeType;
      if (mimeType === "image/bmp") {
        const png = await convertBmpToPng(buffer);
        imageData = png.toString("base64");
        imageMimeType = "image/png";
      }

      return {
        text: userText,
        images: [
          {
            type: "image" as const,
            data: imageData,
            mimeType: imageMimeType,
          },
        ],
      };
    },
  });
}

export async function registerLookAt(pi: ExtensionAPI): Promise<void> {
  const subagent = createLookAtSubagent(pi);
  subagent.subscribe();
  const tool = subagent.asTool();
  pi.registerTool({
    ...tool,

    async execute(
      toolCallId,
      params: LookAtParamsInput,
      signal,
      onUpdate,
      ctx,
    ) {
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  });

  // The vision capability lives on the effective model: the selection itself
  // when physical, or the routed physical model under a virtual (alias)
  // selection. Before an alias has routed on this branch, aliases whose id
  // pins a vision-capable family (gpt, claude, kimi, glm-flash) decide
  // immediately, so the tool is hidden from the first run; mixed families
  // keep the current state until routing state exists. The gate is re-applied
  // in the context handler too: agent_start only fires once per run, but an
  // alias's routing state first appears mid-run (written when the alias
  // answers), so within the very first run on an alias the context event is
  // the only point that sees the routed model.
  const syncTool = (ctx: ExtensionContext): void => {
    const routed = resolveEffectiveModel(
      ctx.model,
      ctx.sessionManager.getBranch(),
      ctx.modelRegistry.getAvailable(),
    );
    const vision = routed
      ? isVisionCapable(routed)
      : aliasVisionCapable(ctx.model);
    const action = visionGateAction(
      vision,
      pi.getActiveTools().includes(TOOL_NAME),
    );
    if (action === "disable") disableTool(pi);
    else if (action === "enable") enableTool(pi);
  };
  pi.on("session_start", (_evt, ctx) => syncTool(ctx));
  pi.on("agent_start", (_evt, ctx) => syncTool(ctx));
  pi.on("model_select", (_evt, ctx) => syncTool(ctx));

  // When the active model cannot see images, detect referenced image files in
  // the conversation and append look_at guidance to those user messages. The
  // context event is non-destructive: changes are re-applied each LLM call and
  // never persisted to the session file.
  pi.on("context", (event, ctx) => {
    syncTool(ctx);
    if (!pi.getActiveTools().includes(TOOL_NAME)) return;

    const model = resolveEffectiveModel(
      ctx.model,
      ctx.sessionManager.getBranch(),
      ctx.modelRegistry.getAvailable(),
    );
    if (!model) return;

    if (!injectLookAtGuidance(event.messages, ctx.cwd)) return;
    return { messages: event.messages };
  });
}
