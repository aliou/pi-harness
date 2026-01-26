import {
  completeSimple,
  getModel,
  type Message,
  type TextContent,
  type UserMessage,
} from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const TITLE_MODEL = {
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
} as const;

const TITLE_PROMPT = `Generate a short title (3-7 words, sentence case) for this coding session based on the user's message. Be concise and capture the main intent. Use common software engineering terms and acronyms when helpful. Do not assume intent beyond what's stated. Output only the title, nothing else.`;

export async function generateTitle(
  text: string,
  ctx: ExtensionContext,
): Promise<string | null> {
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

  const messages: Message[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: text.slice(0, 500),
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

  return response.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
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
