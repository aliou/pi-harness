import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import type { UiMessage } from "../types";
import { TurnItem } from "./TurnItem";

interface MessageListProps {
  messages: UiMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <StickToBottom className="h-full" resize="smooth" initial="smooth">
      <StickToBottom.Content className="p-4 flex flex-col gap-4 select-text">
        {messages.map((message) => (
          <TurnItem key={message.id} message={message} />
        ))}
      </StickToBottom.Content>
      <ScrollToBottomButton />
    </StickToBottom>
  );
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        onClick={() => scrollToBottom()}
        className="absolute bottom-1 right-4 size-8 rounded-full border border-zinc-300 bg-white text-zinc-900 cursor-pointer flex items-center justify-center shadow-lg text-lg z-10 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Scroll to bottom"
      >
        ↓
      </button>
    )
  );
}
