import { useCallback, useEffect, useRef, useState } from "react";

interface InputDialogProps {
  title?: string;
  placeholder?: string;
  prefill?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function InputDialog({
  title,
  placeholder,
  prefill,
  onSubmit,
  onCancel,
}: InputDialogProps) {
  const [value, setValue] = useState(prefill ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit(value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [value, onSubmit, onCancel],
  );

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h3 className="text-sm font-medium text-zinc-900">{title}</h3>
      )}
      <input
        ref={inputRef}
        type="text"
        className="w-full px-3 py-2 text-sm border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-800 rounded hover:bg-zinc-100"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => onSubmit(value)}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
