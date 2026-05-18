import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { useSession } from "@/hooks/useSession";

interface ChatPaneProps {
  sessionPath: string | null;
}

export function ChatPane({ sessionPath }: ChatPaneProps) {
  const {
    messages,
    sessionName,
    isLoading,
    input,
    setInput,
    sendMessage,
    abort,
    isStreaming,
    error,
  } = useSession(sessionPath);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-destructive/10 text-destructive text-xs px-3 py-2 text-center">
          {error}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        {isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Loading session...
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
          />
        )}
      </div>

      {/* Composer */}
      <Composer
        input={input}
        onInputChange={setInput}
        onSend={sendMessage}
        isStreaming={isStreaming}
        onStop={abort}
        disabled={!sessionPath}
      />
    </div>
  );
}
