import * as React from "react";
import { Message, type ChatMessage } from "./Message";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
}

export function MessageList({ messages, isLoading, isStreaming }: MessageListProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prevMessageCount = React.useRef(0);

  // LayoutEffect: snap to bottom BEFORE paint on initial mount or session switch
  // This prevents the flash of seeing the top of the message list
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // If this is the first render with messages (or after a session switch),
    // set scrollTop directly — no animation, happens before paint
    if (messages.length > 0 && prevMessageCount.current === 0) {
      container.scrollTop = container.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Effect: smooth scroll for new incoming messages while streaming
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only smooth-scroll if we're already near the bottom (user hasn't scrolled up)
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (!nearBottom) return;

    // New message arrived — smooth scroll
    if (messages.length > prevMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  // Track scroll position to show "scroll to bottom" button
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setShowScrollDown(!nearBottom);
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Select a session or start a new chat</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Your conversation history will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full overflow-y-auto no-scrollbar">
        <div className="flex flex-col">
          {/* User/assistant alternation with subtle separators */}
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const showDivider = prev && prev.role !== msg.role && msg.role === "assistant";

            return (
              <div key={msg.id}>
                {showDivider && (
                  <div className="max-w-3xl mx-auto">
                    <div className="h-px bg-border/20 my-1" />
                  </div>
                )}
                <Message msg={msg} />
              </div>
            );
          })}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="py-3 max-w-3xl mx-auto">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Pi is thinking...
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-background/90 border border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm hover:text-foreground transition-colors"
        >
          <span>↓</span> Scroll to bottom
        </button>
      )}
    </div>
  );
}
