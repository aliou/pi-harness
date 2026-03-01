import type { UiMessage } from "../types";
import { AssistantTextBlock } from "./AssistantTextBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

interface TurnItemProps {
  message: UiMessage;
}

export function TurnItem({ message }: TurnItemProps) {
  if (message.role === "user") {
    return (
      <div>
        <div className="rounded px-3 py-2 border border-zinc-200 text-zinc-900 shadow-sm whitespace-pre-wrap dark:border-zinc-700 dark:text-zinc-100">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.isStreaming && message.segments.length === 0) {
    return (
      <div>
        <span className="animate-pulse text-zinc-400 text-sm dark:text-zinc-500">...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {message.segments.map((segment) => {
        if (segment.kind === "thinking") {
          return <ThinkingBlock key={segment.id} segment={segment} />;
        }

        if (segment.kind === "tool") {
          const tool = message.toolCalls.find(
            (t) => t.toolCallId === segment.toolCallId,
          );
          if (!tool) return null;
          return <ToolCallBlock key={segment.id} tool={tool} />;
        }

        if (segment.kind === "text") {
          return <AssistantTextBlock key={segment.id} segment={segment} />;
        }

        return null;
      })}
    </div>
  );
}
