import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { useSession } from "@/hooks/useSession";

import { NewSessionPane } from "./NewSessionPane";

interface ChatPaneProps {
  sessionPath: string | null;
  workspacePath?: string | null;
  onStartSession?: (text: string, images?: string[], model?: { id: string; provider: string }) => void;
}

export function ChatPane({ sessionPath, workspacePath, onStartSession }: ChatPaneProps) {
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
    currentModel,
  } = useSession(sessionPath);

  const isEmpty = messages.length === 0 && !isLoading && !isStreaming;

  // Show the big centered composer when there's nothing to display yet
  if (isEmpty) {
    return (
      <div className="flex h-full flex-col bg-background">
        {error && (
          <div className="shrink-0 bg-destructive/10 text-destructive text-xs px-3 py-2 text-center">
            {error}
          </div>
        )}
        <NewSessionPane
          onStartSession={sessionPath ? undefined : onStartSession}
          onSend={sessionPath ? sendMessage : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-destructive/10 text-destructive text-xs px-3 py-2 text-center">
          {error}
        </div>
      )}

      {/* Shared centered column: messages + composer same width */}
      <div className="flex-1 min-h-0 flex flex-col max-w-3xl mx-auto w-full">
        {/* Messages area */}
        <div className="flex-1 min-h-0 overflow-hidden">
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
          currentModel={currentModel}
        />
      </div>
    </div>
  );
}
