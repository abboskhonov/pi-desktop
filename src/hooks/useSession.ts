import * as React from "react";
import { applySessionEvent, type ChatMessage, type SessionEvent } from "@/lib/sessionEvents";

interface UseSessionResult {
  messages: ChatMessage[];
  sessionName: string | null;
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  sendMessage: (text?: string) => void;
  abort: () => void;
  isStreaming: boolean;
  error: string | null;
  currentModel: string | null;
}

export function useSession(sessionPath: string | null): UseSessionResult {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [sessionName, setSessionName] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [currentModel, setCurrentModel] = React.useState<string | null>(null);

  // Load historical messages when session path changes
  React.useEffect(() => {
    if (!sessionPath) {
      setMessages([]);
      setSessionName(null);
      setError(null);
      setIsStreaming(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Load historical messages from file
    window.electron
      .getSessionMessages(sessionPath)
      .then((result) => {
        if (cancelled) return;
        setMessages(
          result.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            text: m.text,
            timestamp: m.timestamp,
            thinking: m.thinking,
            modelName: m.modelName,
            toolCalls: m.toolCards?.map((c) => ({
              toolCallId: c.toolCallId,
              toolName: c.toolName,
              args: c.args,
              output: c.output,
              isError: c.isError,
            })),
          }))
        );
        setSessionName(result.sessionName);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // Open the session in the sidecar (start/resume Pi agent)
    window.electron
      .openSession(sessionPath)
      .catch((err) => {
        console.error("Failed to open session in sidecar:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionPath]);

  // Subscribe to sidecar events
  React.useEffect(() => {
    const unsubReady = window.electron.onSessionReady((payload) => {
      if (payload.model) {
        setCurrentModel(payload.model.name);
      }
    });

    const unsubEvent = window.electron.onSessionEvent((event) => {
      const ev = event as SessionEvent;

      if (ev.type === "agent_start") {
        setIsStreaming(true);
        setError(null);
      }
      if (ev.type === "agent_end") {
        setIsStreaming(false);
      }

      setMessages((prev) => applySessionEvent(prev, ev, currentModel));
    });

    const unsubError = window.electron.onSessionError((err) => {
      setError(err.message);
      setIsStreaming(false);
    });

    return () => {
      unsubReady();
      unsubEvent();
      unsubError();
    };
  }, [currentModel]);

  const sendMessage = React.useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    setInput("");
    setError(null);

    // Send to Pi sidecar — the sidecar will emit message_start for the user message
    // and message_delta/message_end for the assistant response
    window.electron
      .sendPrompt(text)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [input]);

  const abort = React.useCallback(() => {
    window.electron.abortSession().catch(() => {});
    setIsStreaming(false);
  }, []);

  return {
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
  };
}
