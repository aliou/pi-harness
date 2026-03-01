import { useCallback, useEffect, useState } from "react";

interface SelectDialogProps {
  title?: string;
  options: string[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export function SelectDialog({
  title,
  options,
  onSelect,
  onCancel,
}: SelectDialogProps) {
  const [highlighted, setHighlighted] = useState(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlighted((h) => Math.min(h + 1, options.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlighted((h) => Math.max(h - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          onSelect(options[highlighted]);
          break;
        case "Escape":
          e.preventDefault();
          onCancel();
          break;
      }
    },
    [highlighted, options, onSelect, onCancel],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h3 className="text-sm font-medium text-zinc-900">{title}</h3>
      )}
      <div className="flex flex-col gap-1">
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            className={`text-left px-3 py-2 rounded text-sm transition-colors ${
              i === highlighted
                ? "bg-blue-100 text-blue-900"
                : "hover:bg-zinc-100 text-zinc-700"
            }`}
            onClick={() => onSelect(opt)}
            onMouseEnter={() => setHighlighted(i)}
          >
            {opt}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="self-end text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
