import { useEffect, useState } from "react";

const LOADING_FRAMES = ["~", "≈", "∼", "≋"];
const LOADING_INTERVAL_MS = 200;

interface LoadingIndicatorProps {
  isLoading: boolean;
}

export function LoadingIndicator({ isLoading }: LoadingIndicatorProps) {
  if (!isLoading) return null;
  return <_LoadingIndicator />;
}

function _LoadingIndicator() {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % LOADING_FRAMES.length);
    }, LOADING_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className="flex items-center gap-2 px-2 pb-0.5 text-xs text-zinc-500 dark:text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <span className="font-mono text-blue-600 dark:text-blue-400">
        {LOADING_FRAMES[frameIndex]}
      </span>
      <span className="font-mono">inferring</span>
    </div>
  );
}
