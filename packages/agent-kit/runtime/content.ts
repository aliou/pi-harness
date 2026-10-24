import type { TextContent } from "@earendil-works/pi-ai";
import { isNotNil } from "@harness/utils";
import type { SubagentDisclaimer } from "../types";

export function textContent(text: string): TextContent {
  return { type: "text", text };
}

/**
 * Deliver the subagent's answer inside `<subagent-output>`, surrounded by the
 * configured `<disclaimer>` blocks. The answer is inserted verbatim: a literal
 * closing tag inside it only moves the block boundary, which costs nothing
 * because the whole text already arrives as one tool result.
 */
export function frameSubagentResponse(
  response: string,
  toolName: string,
  disclaimer?: SubagentDisclaimer,
): string {
  return [
    disclaimerBlock(disclaimer?.before),
    `<subagent-output agent="${toolName}">\n${response}\n</subagent-output>`,
    disclaimerBlock(disclaimer?.after),
  ]
    .filter(isNotNil)
    .join("\n\n");
}

function disclaimerBlock(text: string | undefined): string | undefined {
  return text ? `<disclaimer>\n${text}\n</disclaimer>` : undefined;
}

export function appendSubagentSessionFooter(
  text: string,
  toolName: string,
  sessionId: string,
) {
  return `${text}

---
Subagent session:
- sessionId: ${sessionId}

To continue this session, call resume_${toolName} with this sessionId.`;
}
