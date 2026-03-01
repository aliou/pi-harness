import { useCallback, useEffect } from "react";

interface ConfirmDialogProps {
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onConfirm, onCancel],
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
      {message && <p className="text-sm text-zinc-600">{message}</p>}
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
          onClick={onConfirm}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
