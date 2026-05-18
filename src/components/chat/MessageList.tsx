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
  const initialSnapRef = React.useRef(false);
  const rafRef = React.useRef<number>(0);

  // ── Initial snap: hard scroll to bottom on first messages of a session ──
  // Resets when messages clear (session switch) so the next session also snaps.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (messages.length === 0) {
      initialSnapRef.current = false;
      return;
    }

    // Snap once when the first messages arrive for this session
    if (!initialSnapRef.current) {
      container.scrollTop = container.scrollHeight;
      initialSnapRef.current = true;
    }
  }, [messages.length]);

  // ── Streaming scroll: batched smooth scroll to bottom ──
  // Uses requestAnimationFrame so rapid tokens don't queue overlapping scrolls.
  React.useEffect(() => {
    if (!isStreaming) return;
    const container = containerRef.current;
    if (!container) return;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (!nearBottom) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [messages, isStreaming]);

  // ── Scroll-to-bottom button visibility ──
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setShowScrollDown(!nearBottom);
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Empty state: include isStreaming so we don't show placeholder while waiting
  if (messages.length === 0 && !isLoading && !isStreaming) {
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
      <div ref={containerRef} className="h-full overflow-y-auto no-scrollbar pb-6">
        <div className="flex flex-col">
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
