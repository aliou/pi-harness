import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { ToolExecution } from "../types";

interface ToolCallBlockProps {
  tool: ToolExecution;
}

const PREVIEW_LINES = 10;

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep raw text
    }
  }
  return text;
}

function ResultBody({
  label,
  text,
  className,
}: {
  label: string;
  text: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const display = useMemo(() => {
    const parsed = tryParseJson(text);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  }, [text]);

  const lines = useMemo(() => display.split("\n"), [display]);
  const isLong = lines.length > PREVIEW_LINES;
  const visible = isLong && !showAll ? lines.slice(0, PREVIEW_LINES).join("\n") : display;

  return (
    <div className="px-2.5 py-2 border-t border-zinc-200 dark:border-zinc-700">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{label}</div>
        {isLong ? (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            {showAll ? (
              <>
                <CaretUp size={12} />
                Show less
              </>
            ) : (
              <>
                <CaretDown size={12} />
                Show all
              </>
            )}
          </button>
        ) : null}
      </div>
      <pre
        className={`whitespace-pre-wrap break-words font-mono text-[11px] ${className ?? ""}`}
      >
        {visible}
      </pre>
    </div>
  );
}

export function ToolCallBlock({ tool }: ToolCallBlockProps) {
  const statusEl =
    tool.status === "running" ? (
      <span className="text-amber-600">...</span>
    ) : tool.status === "done" ? (
      <span className="text-emerald-600">done</span>
    ) : (
      <span className="text-rose-600">error</span>
    );

  return (
    <details>
      <summary className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 list-none dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
        {statusEl}
        <span className="font-mono text-xs">{tool.toolName}</span>
        {tool.summary && (
          <span className="ml-auto text-xs text-zinc-500 truncate dark:text-zinc-400">{tool.summary}</span>
        )}
      </summary>

      <div className="mt-1 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="px-2.5 py-2">
          <div className="text-[11px] font-medium text-zinc-600 mb-1 dark:text-zinc-400">Arguments</div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>

        {tool.status === "running" && tool.partialOutput && (
          <ResultBody label="Output (streaming)" text={tool.partialOutput} />
        )}

        {tool.result && <ResultBody label="Output" text={tool.result} />}

        {tool.error && (
          <ResultBody label="Error" text={tool.error} className="text-rose-600" />
        )}
      </div>
    </details>
  );
}
