import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRexAutocompleteProvider } from "./provider";

export default function (pi: ExtensionAPI) {
  if (!process.env.REX_SESSION && !process.env.REX_BLOCK) return;

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) =>
      createRexAutocompleteProvider(current, pi, {
        sessionId: process.env.REX_SESSION,
        blockId: process.env.REX_BLOCK,
      }),
    );
  });

  pi.on("context", (event) => {
    const last = event.messages.at(-1);
    if (last?.role !== "user") return;

    const refs = extractRexRefs(messageText(last.content));
    if (refs.length === 0) return;

    const existing = messageText(last.content);
    const blocks = refs
      .map(buildGuidanceBlock)
      .filter((block) => !existing.includes(block));
    if (blocks.length === 0) return;

    appendGuidance(last, blocks.join("\n\n"));
    return { messages: event.messages };
  });
}

interface RexRef {
  kind: "session" | "block";
  id: string;
  label: string;
}

function extractRexRefs(text: string): RexRef[] {
  const refs: RexRef[] = [];
  const re = /(^|\s)@rex:(session|block):([^\s`"]+)/g;
  for (const match of text.matchAll(re)) {
    refs.push({
      kind: match[2] as RexRef["kind"],
      id: match[3] ?? "",
      label: match[0].trim(),
    });
  }
  return refs;
}

const KIND_GUIDANCE: Record<RexRef["kind"], string> = {
  session:
    "Inspect it with `rex session inspect <id> --json` (windows, focused panes, layout), list its panes with `rex block ls -s <id> --json`, and target its commands with `-s <id>`.",
  block:
    'Target it with `-b <id>`: read output with `rex capture -b <id>`, type with `rex send -b <id> --text "..."`, press keys with `rex send-key -b <id> --key enter` (never send a newline as text), and close with `rex api call block.close` given `{session_id, block_id}`. The block\'s session ID appears in its `@rex:block:` value after `block:` in most listings, or find it with `rex ls --json` and `rex session inspect <session> --json`.',
};

function buildGuidanceBlock(ref: RexRef): string {
  return `"${ref.label}" is a reference to a rex ${ref.kind} with ID \`${ref.id}\`. ${KIND_GUIDANCE[ref.kind]}`;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text",
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

function appendGuidance(message: UserMessage, guidance: string) {
  if (typeof message.content === "string") {
    message.content = `${message.content}\n\n${guidance}`;
  } else if (Array.isArray(message.content)) {
    message.content = [...message.content, { type: "text", text: guidance }];
  }
}
