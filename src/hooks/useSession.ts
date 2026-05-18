import * as React from "react";
import {
  applySessionEvent,
  type ChatMessage,
  type SessionEvent,
} from "@/lib/sessionEvents";
import {
  setSessionStreaming,
  markSessionViewed,
  useSessionActivity,
  touchSessionToken,
} from "@/lib/sessionActivity";

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
  const [error, setError] = React.useState<string | null>(null);
  const [currentModel, setCurrentModel] = React.useState<string | null>(null);

  // Streaming state is global per-session, not local to this hook instance.
  const activity = useSessionActivity(sessionPath || "");
  const isStreaming = activity.isStreaming;

  // Load historical messages when session path changes
  React.useEffect(() => {
    if (!sessionPath) {
      setMessages([]);
      setSessionName(null);
      setError(null);
      return;
    }

    // User is looking at this session — clear the "new content" dot.
    markSessionViewed(sessionPath);

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
      const ev = event as SessionEvent & {
        _sessionFile?: string | null;
        _sessionId?: string | null;
      };

      const eventSessionFile = ev._sessionFile;

      // ── Cross-session events ─────────────────────────────────────────
      // Update the other session's global state but don't touch our messages.
      if (eventSessionFile && eventSessionFile !== sessionPath) {
        if (ev.type === "agent_start") {
          setSessionStreaming(eventSessionFile, true);
        }
        if (ev.type === "agent_end") {
          setSessionStreaming(eventSessionFile, false);
        }
        if (
          ev.type === "message_delta" ||
          ev.type === "message_update" ||
          ev.type === "tool_execution_update"
        ) {
          touchSessionToken(eventSessionFile);
        }
        return;
      }

      // ── Our session (or untagged legacy events) ──────────────────────
      if (ev.type === "agent_start") {
        if (sessionPath) setSessionStreaming(sessionPath, true);
        setError(null);
      }
      if (ev.type === "agent_end") {
        if (sessionPath) {
          setSessionStreaming(sessionPath, false);
          markSessionViewed(sessionPath);
        }
      }
      if (
        ev.type === "message_delta" ||
        ev.type === "message_update" ||
        ev.type === "tool_execution_update"
      ) {
        if (sessionPath) touchSessionToken(sessionPath);
      }

      setMessages((prev) => applySessionEvent(prev, ev, currentModel));
    });

    const unsubError = window.electron.onSessionError((err) => {
      const errorSessionFile = err._sessionFile ?? null;

      // ── Cross-session error ─────────────────────────────────────────
      if (errorSessionFile && errorSessionFile !== sessionPath) {
        setSessionStreaming(errorSessionFile, false);
        return;
      }

      // ── Our session (or untagged legacy error) ──────────────────────
      setError(err.message);
      if (sessionPath) setSessionStreaming(sessionPath, false);
    });

    return () => {
      unsubReady();
      unsubEvent();
      unsubError();
    };
  }, [sessionPath, currentModel]);

  const sendMessage = React.useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text) return;

      setInput("");
      setError(null);

      window.electron.sendPrompt(text).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [input]
  );

  const abort = React.useCallback(() => {
    window.electron.abortSession().catch(() => {});
    if (sessionPath) setSessionStreaming(sessionPath, false);
  }, [sessionPath]);

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
