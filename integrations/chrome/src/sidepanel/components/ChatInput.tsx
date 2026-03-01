import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}

const MAX_LINES = 5;

function resizeToContent(textarea: HTMLTextAreaElement): void {
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight || "20") || 20;
  const paddingTop = Number.parseFloat(styles.paddingTop || "0") || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom || "0") || 0;
  const borderTop = Number.parseFloat(styles.borderTopWidth || "0") || 0;
  const borderBottom = Number.parseFloat(styles.borderBottomWidth || "0") || 0;

  const maxHeight =
    lineHeight * MAX_LINES +
    paddingTop +
    paddingBottom +
    borderTop +
    borderBottom;

  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
  prefill,
  onPrefillConsumed,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (prefill) {
      setValue(prefill);
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    resizeToContent(textareaRef.current);
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
  };

  const canSubmit = !!value.trim() && !disabled && !isStreaming;

  return (
    <div className="border border-zinc-200 rounded-lg bg-white flex flex-col dark:border-zinc-700 dark:bg-zinc-900">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={disabled ? "Bridge disconnected" : "Ask me to browse, click, read, or automate..."}
          disabled={disabled || isStreaming}
          rows={3}
          className="w-full resize-none overflow-auto border-none outline-none bg-transparent text-sm text-zinc-900 p-2 px-3 pr-12 dark:text-zinc-100"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />

        <button
          type="button"
          onClick={isStreaming ? onAbort : submit}
          disabled={isStreaming ? false : !canSubmit}
          className="absolute bottom-2 right-2 flex items-center justify-center p-1 rounded w-6 h-6 text-zinc-500 hover:bg-zinc-100 transition-colors disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title={isStreaming ? "Abort" : "Send"}
          aria-label={isStreaming ? "Abort" : "Send"}
        >
          {isStreaming ? <Stop size={16} /> : <PaperPlaneTilt size={16} />}
        </button>
      </div>
    </div>
  );
}
