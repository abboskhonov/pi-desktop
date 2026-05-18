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
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (messages.length === 0) {
      initialSnapRef.current = false;
      return;
    }

    if (!initialSnapRef.current) {
      container.scrollTop = container.scrollHeight;
      initialSnapRef.current = true;
    }
  }, [messages.length]);

  // ── Streaming scroll: batched smooth scroll to bottom ──
  React.useEffect(() => {
    if (!isStreaming) return;
    const container = containerRef.current;
    if (!container) return;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
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
        el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      setShowScrollDown(!nearBottom);
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Empty state
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
      <div
        ref={containerRef}
        className="h-full overflow-y-auto no-scrollbar pb-8 pt-4 px-5"
      >
        <div className="flex flex-col">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            // Extra gap when switching between user and agent
            const gapClass =
              prev && prev.role !== msg.role
                ? "mt-6"
                : prev && prev.role === msg.role
                  ? "mt-1"
                  : "";

            return (
              <div key={msg.id} className={gapClass}>
                <Message msg={msg} />
              </div>
            );
          })}

          {/* Streaming indicator — left-aligned like an agent message */}
          {isStreaming && (
            <div className="mt-6 flex justify-start">
              <div className="flex items-center gap-2 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "400ms" }} />
                <span className="text-[12px] text-muted-foreground/40 ml-1">thinking</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-6" />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-background/90 border border-border/50 px-3.5 py-1.5 text-[11px] text-muted-foreground shadow-sm hover:text-foreground transition-colors backdrop-blur-sm"
        >
          <span>↓</span> Scroll to bottom
        </button>
      )}
    </div>
  );
}
