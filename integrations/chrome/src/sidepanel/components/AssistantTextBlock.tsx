import { Streamdown } from "streamdown";
import type { AssistantSegment } from "../types";

interface AssistantTextBlockProps {
  segment: Extract<AssistantSegment, { kind: "text" }>;
}

export function AssistantTextBlock({ segment }: AssistantTextBlockProps) {
  return (
    <div>
      <Streamdown className="assistant-md text-sm text-zinc-900 leading-relaxed dark:text-zinc-100">
        {segment.text}
      </Streamdown>
      {segment.isStreaming && (
        <span className="animate-blink ml-0.5 inline-block w-[2px] h-[1em] bg-current align-text-bottom" />
      )}
    </div>
  );
}
