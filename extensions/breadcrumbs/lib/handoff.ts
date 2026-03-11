/**
 * Shared handoff logic used by both the /handoff command and the handoff tool.
 *
 * Extracts context from the current session using a subagent with a
 * `create_handoff_context` tool, then creates a new session with the
 * extracted context as the initial message.
 */

import type {
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { executeSubagent, resolveModel } from "../../../packages/agent-kit";
import { readCurrentSessionContent } from "./session-content-reader";

/**
 * Result of context extraction.
 */
export interface ExtractedHandoffContext {
  relevantInformation: string;
  relevantFiles: string[];
}

/**
 * Result of a successful handoff.
 */
export interface HandoffResult {
  goal: string;
  parentSessionId: string;
  relevantFiles: string[];
  contextLength: number;
}

/**
 * Default model for the extraction subagent.
 */
const DEFAULT_EXTRACTION_MODEL = {
  provider: "google",
  id: "google/gemini-2.0-flash-001",
};

/**
 * Schema for the create_handoff_context tool.
 */
const CreateHandoffContextParams = Type.Object({
  relevantInformation: Type.String({
    description:
      "Concise summary of the FINAL STATE of the conversation: what is implemented, final decisions, current technical details, what works and what is broken, remaining open questions or next steps.",
  }),
  relevantFiles: Type.Array(Type.String(), {
    description:
      "File paths relevant to the goal (that exist or were created during the session).",
  }),
});

/**
 * System prompt for the extraction subagent.
 *
 * Written in first person, goal-focused. The subagent writes as if it is
 * the one continuing the work -- "I implemented X", "I need to do Y".
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a coding assistant. You will be given a conversation history and a goal for a new session.

Extract the FINAL STATE of what was accomplished and call create_handoff_context with the results.

Write relevantInformation in FIRST PERSON, as if you did the work and are briefing yourself for the next session. Use "I" statements:
- "I implemented X" not "X was implemented"
- "I decided to use Y because Z" not "Y was chosen"
- "I still need to do W" not "W needs to be done"

Focus on WHERE THINGS ENDED UP, not the journey:
- If something was planned then implemented, say "I implemented it"
- If something was discussed then decided against, state the final decision
- The new session needs the current state, not the full history

Cover:
- What I built / changed
- Final decisions and why
- Current technical details (APIs, data structures, patterns in use)
- What works and what is broken right now
- Remaining open questions or next steps

For relevantFiles, list file paths that are relevant to the goal.

Be concise and specific. Prioritize the END of the conversation over the beginning.
You MUST call create_handoff_context exactly once.
Do NOT generate any conversational text, greetings, or role-played dialogue. Do NOT continue the conversation from the session content. Your ONLY output should be a single call to create_handoff_context.`;

/**
 * Extract handoff context from the current session using a subagent.
 *
 * Spins up a subagent with a `create_handoff_context` tool. The subagent
 * reads the session content and calls the tool with the extracted context.
 *
 * @param goal - The goal for the new session
 * @param ctx - Extension context
 * @param onTextUpdate - Optional callback for streaming text deltas
 * @param signal - Abort signal for cancellation (combined with a 120s timeout internally)
 */
export async function extractHandoffContext(
  goal: string,
  ctx: ExtensionContext,
  onTextUpdate: ((delta: string) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<ExtractedHandoffContext> {
  const sessionContent = readCurrentSessionContent(ctx.sessionManager);
  if (!sessionContent) {
    throw new Error(
      "Cannot read current session content. Is this an ephemeral session?",
    );
  }

  // Resolve model -- fall back to the session's current model
  let model: ReturnType<typeof resolveModel>;
  try {
    model = resolveModel(
      DEFAULT_EXTRACTION_MODEL.provider,
      DEFAULT_EXTRACTION_MODEL.id,
      ctx,
    );
  } catch {
    if (!ctx.model) {
      throw new Error("No model available for handoff extraction");
    }
    model = ctx.model;
  }

  // Closure variable captured by the tool's execute function
  let captured: ExtractedHandoffContext | null = null;

  const createHandoffContextTool: ToolDefinition = {
    name: "create_handoff_context",
    label: "Create Handoff Context",
    description:
      "Creates a handoff context from the current state of the conversation. Include any relevant information, code snippets, and file paths. Be as concise as possible.",
    parameters: CreateHandoffContextParams,
    async execute(
      _toolCallId: string,
      params: { relevantInformation: string; relevantFiles: string[] },
    ) {
      captured = {
        relevantInformation: params.relevantInformation,
        relevantFiles: params.relevantFiles,
      };
      return {
        content: [{ type: "text" as const, text: "Context captured." }],
      };
    },
  } as unknown as ToolDefinition;

  const userMessage = `## Goal for New Session\n\n${goal}\n\n## Session Content\n\n${sessionContent}`;

  // Combine caller signal with a 120s timeout
  const timeoutSignal = AbortSignal.timeout(120_000);
  let combinedSignal: AbortSignal;
  if (signal) {
    combinedSignal = AbortSignal.any([signal, timeoutSignal]);
  } else {
    combinedSignal = timeoutSignal;
  }

  await executeSubagent(
    {
      name: "handoff",
      model,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      customTools: [createHandoffContextTool],
      thinkingLevel: "off",
      logging: { enabled: true, debug: true },
    },
    userMessage,
    ctx,
    onTextUpdate ? (delta) => onTextUpdate(delta) : undefined,
    combinedSignal,
  );

  if (!captured) {
    throw new Error(
      "Context extraction failed: subagent did not call create_handoff_context",
    );
  }

  return captured;
}
