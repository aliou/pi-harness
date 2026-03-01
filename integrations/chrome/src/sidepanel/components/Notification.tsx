import { useEffect } from "react";
import type { NotificationItem } from "../types";

const AUTO_DISMISS_MS = 5000;

const typeStyles: Record<NotificationItem["type"], string> = {
  info: "bg-blue-50 text-blue-800 border-blue-200",
  warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
  error: "bg-red-50 text-red-800 border-red-200",
};

interface NotificationStackProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}

export function NotificationStack({
  notifications,
  onDismiss,
}: NotificationStackProps) {
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map((n) =>
      window.setTimeout(() => onDismiss(n.id), AUTO_DISMISS_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-2 left-2 right-2 z-40 flex flex-col gap-1">
      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`text-left text-xs px-3 py-2 rounded border shadow-sm ${typeStyles[n.type]}`}
          onClick={() => onDismiss(n.id)}
        >
          {n.message}
        </button>
      ))}
    </div>
  );
}
