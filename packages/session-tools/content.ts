import type { CompactEntry, SessionEntry } from "./types";

const PREVIEW_LIMIT = 160;

export const truncate = (text: string, limit = PREVIEW_LIMIT): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
};

const contentToText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (b.type === "thinking" && typeof b.thinking === "string") {
        return `[thinking] ${b.thinking}`;
      }
      if (b.type === "toolCall") {
        const name = typeof b.name === "string" ? b.name : "unknown";
        return `[tool call: ${name}]`;
      }
      if (b.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

export const entryRole = (entry: SessionEntry): string | undefined => {
  if (entry.type === "message") return entry.message.role;
  if (entry.type === "custom_message") return "custom";
  return undefined;
};

export const entrySearchText = (entry: SessionEntry): string => {
  switch (entry.type) {
    case "message":
      if ("content" in entry.message)
        return contentToText(entry.message.content);
      if (entry.message.role === "bashExecution") return entry.message.output;
      return "";
    case "custom_message":
      return contentToText(entry.content);
    case "compaction":
    case "branch_summary":
      return entry.summary;
    case "custom":
      return JSON.stringify(entry.data ?? "");
    case "label":
      return entry.label ?? "";
    case "session_info":
      return entry.name ?? "";
    case "model_change":
      return `${entry.provider}/${entry.modelId}`;
    case "thinking_level_change":
      return entry.thinkingLevel;
    case "usage":
      return `${entry.kind} ${entry.provider}/${entry.model}${entry.note ? ` ${entry.note}` : ""}`;
    case "context_edit":
      return `[context edit: ${entry.targetId}]`;
  }
};

export const entryPreview = (
  entry: SessionEntry,
  limit = PREVIEW_LIMIT,
): string => truncate(entrySearchText(entry), limit);

export const compactEntry = (
  entry: SessionEntry,
  label?: string,
  childCount?: number,
  isMainBranch?: boolean,
): CompactEntry => ({
  id: entry.id,
  parentId: entry.parentId,
  timestamp: entry.timestamp,
  type: entry.type,
  role: entryRole(entry),
  label,
  childCount,
  isMainBranch,
  preview: entryPreview(entry),
});

export const fullEntryContent = (entry: SessionEntry): unknown => {
  switch (entry.type) {
    case "message":
      return entry.message;
    case "custom_message":
      return {
        customType: entry.customType,
        content: entry.content,
        details: entry.details,
        display: entry.display,
      };
    default:
      return entry;
  }
};
