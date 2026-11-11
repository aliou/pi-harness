import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent } from "@harness/agent-kit";
import { convertBmpToPng } from "@harness/image-formats";
import { resolveEffectiveModel } from "@harness/models";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { renderLookAtDetails, renderLookAtHeader } from "./render";
import { LookAtParams, type LookAtParamsInput } from "./types";
import {
  detectSupportedImageMimeType,
  injectLookAtGuidance,
  isVisionCapable,
} from "./utils";

const TOOL_NAME = "look_at";

/** Creates the production look-at subagent for registration and eval harnesses. */
export function createLookAtSubagent(pi: ExtensionAPI) {
  return createSubagent(pi, {
    name: TOOL_NAME,
    modelPreferences: [
      { provider: "agents", model: TOOL_NAME, thinking: "off" },
    ],
    label: "Look At",
    description: `Analyze an image file using a vision subagent. Returns a text description of the image content.

Use this tool when you need to understand or extract information from an image file (PNG, JPG, GIF, WebP, BMP, etc.). On vision-capable models this reads the image file directly so you can inspect it yourself; otherwise it delegates to a vision-capable subagent.

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
      // On vision-capable models the caller can see the image itself: hand
      // back the read tool's result for the file and ignore the objective.
      const routed = resolveEffectiveModel(
        ctx.model,
        ctx.sessionManager.getBranch(),
        ctx.modelRegistry.getAvailable(),
      );
      if (routed && isVisionCapable(routed)) {
        const outcome = await ctx.executeTool(
          "read",
          { path: params.path },
          {
            signal,
            onUpdate,
          },
        );
        return outcome.result;
      }
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  });

  // When the active model cannot see images, detect referenced image files in
  // the conversation and append look_at guidance to those user messages. The
  // context event is non-destructive: changes are re-applied each LLM call and
  // never persisted to the session file.
  pi.on("context", (event, ctx) => {
    const model = resolveEffectiveModel(
      ctx.model,
      ctx.sessionManager.getBranch(),
      ctx.modelRegistry.getAvailable(),
    );
    if (!model || isVisionCapable(model)) return;

    if (!injectLookAtGuidance(event.messages, ctx.cwd)) return;
    return { messages: event.messages };
  });
}
