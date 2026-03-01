import { Streamdown } from "streamdown";
import type { AssistantSegment } from "../types";

interface ThinkingBlockProps {
  segment: Extract<AssistantSegment, { kind: "thinking" }>;
}

export function ThinkingBlock({ segment }: ThinkingBlockProps) {
  const label =
    segment.durationMs !== undefined
      ? `Thinking · ${(segment.durationMs / 1000).toFixed(1)}s`
      : "Thinking";

  return (
    <details className="mb-1 p-2 border border-zinc-200 rounded text-xs font-mono text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      <summary className="cursor-pointer font-medium list-none">
        {segment.isStreaming ? <span className="shimmer-text">Thinking...</span> : label}
      </summary>
      <div className="mt-2 max-h-48 overflow-auto">
        <Streamdown className="text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-100 dark:[&_pre]:bg-zinc-800 [&_pre]:p-1.5 [&_code]:text-[0.9em]">
          {segment.text}
        </Streamdown>
      </div>
    </details>
  );
}
