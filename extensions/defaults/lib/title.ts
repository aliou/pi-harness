import {
  type AssistantMessage,
  completeSimple,
  getModel,
  type Message,
  type TextContent,
  type UserMessage,
} from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const TITLE_MODEL = {
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
} as const;

const MAX_TITLE_LENGTH = 50;
const MAX_RETRIES = 2;
const FALLBACK_LENGTH = 50;
const TITLE_ENTRY_TYPE = "ad:session-title";

const TITLE_PROMPT = `You are generating a succinct title for a coding session based on the provided conversation.

Requirements:
- Maximum 50 characters
- Sentence case (capitalize only first word and proper nouns)
- Capture the main intent or task
- Reuse the user's exact words and technical terms
- Match the user's language (if they write in French, respond in French)
- No quotes, colons, or markdown formatting
- No generic titles like "Coding session" or "Help with code"
- No explanations or commentary

Output ONLY the title text. Nothing else.

Examples:
- Debug 500 errors in auth middleware
- Add refresh token support
- Refactor user service tests
- Migrer la base de donnees vers Postgres`;

export function buildFallbackTitle(userText: string): string {
  const text = userText.trim();
  if (text.length <= FALLBACK_LENGTH) return text;
  const truncated = text.slice(0, FALLBACK_LENGTH - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}...`;
}

export function postProcessTitle(raw: string): string {
  let title = raw;

  // Strip <think>...</think> tags (some models leak these)
  title = title.replace(/<think>[\s\S]*?<\/think>\s*/g, "");

  // Strip wrapping quotes (single, double, backticks)
  title = title.replace(/^["'`]+|["'`]+$/g, "");

  // Strip markdown formatting (bold, italic, headers)
  title = title.replace(/^#+\s*/, "");
  title = title.replace(/\*{1,2}(.*?)\*{1,2}/g, "$1");
  title = title.replace(/_{1,2}(.*?)_{1,2}/g, "$1");

  // Strip meta-prefixes the model might add despite instructions
  title = title.replace(/^(Title|Summary|Session)\s*:\s*/i, "");

  // Take first non-empty line only
  title =
    title
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? title;

  // Trim whitespace
  title = title.trim();

  // Enforce max length: truncate at word boundary, add "..." if truncated
  if (title.length > MAX_TITLE_LENGTH) {
    const truncated = title.slice(0, MAX_TITLE_LENGTH - 3);
    const lastSpace = truncated.lastIndexOf(" ");
    title = `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}...`;
  }

  return title;
}

export async function generateTitle(
  userText: string,
  assistantText: string,
  ctx: ExtensionContext,
): Promise<string> {
  const model = getModel(TITLE_MODEL.provider, TITLE_MODEL.model);
  if (!model) {
    throw new Error(
      `Model not found: ${TITLE_MODEL.provider}/${TITLE_MODEL.model}`,
    );
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) {
    throw new Error(`No API key for provider: ${TITLE_MODEL.provider}`);
  }

  // Build the conversation description using XML-style tags (like Claude Code)
  // This avoids "User message:" labels that the model might echo as titles
  const description = assistantText
    ? `<user>${userText}</user>\n<assistant>${assistantText}</assistant>`
    : userText;

  const messages: Message[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${TITLE_PROMPT}\n\n<conversation>\n${description}\n</conversation>\n\nGenerate a title:`,
        },
      ],
      timestamp: Date.now(),
    },
  ];

  const response = await completeSimple(
    model,
    { systemPrompt: TITLE_PROMPT, messages },
    { apiKey },
  );

  const raw = response.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  return postProcessTitle(raw);
}

export function getFirstUserText(ctx: ExtensionContext): string | null {
  const entries = ctx.sessionManager.getEntries();
  const firstUserEntry = entries.find(
    (e) => e.type === "message" && e.message.role === "user",
  );
  if (!firstUserEntry || firstUserEntry.type !== "message") return null;

  const msg = firstUserEntry.message as UserMessage;
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join(" ");
}

export function getFirstAssistantText(ctx: ExtensionContext): string | null {
  const entries = ctx.sessionManager.getEntries();
  const firstAssistantEntry = entries.find(
    (e) => e.type === "message" && e.message.role === "assistant",
  );
  if (!firstAssistantEntry || firstAssistantEntry.type !== "message")
    return null;

  const msg = firstAssistantEntry.message as AssistantMessage;
  // Filter for text content only -- this naturally excludes thinking blocks
  // which have type "thinking", not "text".
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export async function generateAndSetTitle(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  const userText = getFirstUserText(ctx);
  if (!userText?.trim()) {
    ctx.ui.notify("No user message to generate title from", "warning");
    return;
  }

  const assistantText = getFirstAssistantText(ctx) ?? "";

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const title = await generateTitle(userText, assistantText, ctx);
      if (title) {
        pi.setSessionName(title);
        pi.appendEntry(TITLE_ENTRY_TYPE, {
          title,
          rawUserText: userText,
          rawAssistantText: assistantText,
          attempt,
        });
        ctx.ui.notify(`Session: ${title}`, "info");
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        ctx.ui.notify(
          `Title generation failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`,
          "warning",
        );
      }
    }
  }

  // All retries exhausted -- fallback
  const fallback = buildFallbackTitle(userText);
  pi.setSessionName(fallback);
  pi.appendEntry(TITLE_ENTRY_TYPE, {
    title: fallback,
    fallback: true,
    error: lastError?.message ?? "Unknown error",
    rawUserText: userText,
    rawAssistantText: assistantText,
  });
  ctx.ui.notify(
    `Title generation failed, using fallback: ${fallback}`,
    "error",
  );
}
