import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export interface SessionMeta {
  sessionId: string;
  leafId: string;
  startedAt: string;
  exportedAt: string;
  cwd: string;
}

export interface ExportOptions {
  toolCalls: boolean;
  toolResults: boolean;
  thinking: boolean;
}

function formatFrontmatter(meta: SessionMeta): string {
  return [
    "---",
    `session_id: ${meta.sessionId}`,
    `leaf_id: ${meta.leafId}`,
    `started: ${meta.startedAt}`,
    `exported: ${meta.exportedAt}`,
    `project: ${meta.cwd}`,
    "---",
  ].join("\n");
}

function formatUserMessage(message: UserMessage): string {
  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join("\n");

  return `## User\n\n${content}`;
}

function formatThinking(text: string): string {
  return `<details>\n<summary>Thinking</summary>\n\n${text}\n\n</details>`;
}

function fenceWrap(text: string, lang = ""): string {
  const maxRun = longestBacktickRun(text);
  const fence = "`".repeat(Math.max(3, maxRun + 1));
  return `${fence}${lang}\n${text}\n${fence}`;
}

function longestBacktickRun(text: string): number {
  let max = 0;
  let current = 0;
  for (const ch of text) {
    if (ch === "`") {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  const json = JSON.stringify(args, null, 2);
  return `#### ${name}\n\n${fenceWrap(json, "json")}`;
}

function formatToolResult(
  content: (TextContent | { type: string; data?: string })[],
  isError: boolean,
): string {
  const text = content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  if (isError) return fenceWrap(text, "error");

  const hasCodeFences = /^```/m.test(text);
  return fenceWrap(text, hasCodeFences ? "markdown" : "");
}

function formatAssistantMessage(
  message: AssistantMessage,
  options: ExportOptions,
  toolResults: Map<string, ToolResultMessage>,
): string {
  const parts: string[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "thinking" && options.thinking) {
      parts.push(formatThinking((block as ThinkingContent).thinking));
    } else if (block.type === "toolCall" && options.toolCalls) {
      const toolCall = block as ToolCall;
      parts.push(formatToolCall(toolCall.name, toolCall.arguments));

      // Pair the tool result immediately after its call
      if (options.toolResults) {
        const result = toolResults.get(toolCall.id);
        if (result) {
          parts.push(formatToolResult(result.content, result.isError));
        }
      }
    }
  }

  return `## Assistant\n\n${parts.join("\n\n")}`;
}

export function exportToMarkdown(
  entries: SessionEntry[],
  options: ExportOptions,
  meta: SessionMeta,
): string {
  const sections: string[] = [formatFrontmatter(meta)];

  // Build a lookup of toolCallId -> ToolResultMessage so we can pair them
  // with their corresponding tool calls in the assistant message.
  const toolResults = new Map<string, ToolResultMessage>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if (entry.message.role === "toolResult") {
      const msg = entry.message as ToolResultMessage;
      toolResults.set(msg.toolCallId, msg);
    }
  }

  for (const entry of entries) {
    if (entry.type !== "message") continue;

    const message = entry.message;

    if (message.role === "user") {
      sections.push(formatUserMessage(message as UserMessage));
    } else if (message.role === "assistant") {
      const formatted = formatAssistantMessage(
        message as AssistantMessage,
        options,
        toolResults,
      );
      // Only add if there's content beyond the heading
      if (formatted.trim() !== "## Assistant") {
        sections.push(formatted);
      }
    }
  }

  return `${sections.join("\n\n")}\n`;
}

function sanitizePath(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function getExportPath(
  cwd: string,
  sessionId: string,
  leafId: string,
): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  const safePath = sanitizePath(cwd);
  const exportDir = join(agentDir, "session-exports", safePath);

  mkdirSync(exportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}_${sessionId.slice(0, 8)}_${leafId.slice(0, 8)}.md`;

  return join(exportDir, filename);
}
