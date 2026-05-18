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
  sendMessage: (text?: string, images?: string[]) => void;
  abort: () => void;
  isStreaming: boolean;
  error: string | null;
  currentModel: string | null;
}

type TokenBuffer = {
  textDelta: string;
  thinkingDelta: string;
  /** toolCallId → accumulated output */
  toolOutputs: Map<string, string>;
};

export function useSession(sessionPath: string | null): UseSessionResult {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [sessionName, setSessionName] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef(input);
  inputRef.current = input;
  const [error, setError] = React.useState<string | null>(null);
  const [currentModel, setCurrentModel] = React.useState<string | null>(null);

  const activity = useSessionActivity(sessionPath || "");
  const isStreaming = activity.isStreaming;

  // Token batching: accumulate text/thinking/tool deltas in a ref and flush via rAF.
  // Reduces setMessages calls from ~N per token to ~1 per frame.
  const bufferRef = React.useRef<TokenBuffer | null>(null);
  const flushRafRef = React.useRef<number>(0);

  const flushBuffer = React.useCallback(() => {
    flushRafRef.current = 0;
    const buf = bufferRef.current;
    if (!buf) return;
    bufferRef.current = null;

    setMessages((prev) => {
      const last = prev.at(-1);
      if (!last || last.role !== "assistant") return prev;

      let nextLast = { ...last };

      // Apply text delta
      if (buf.textDelta) {
        nextLast = { ...nextLast, text: nextLast.text + buf.textDelta };
      }

      // Apply thinking delta
      if (buf.thinkingDelta) {
        nextLast = {
          ...nextLast,
          thinking: (nextLast.thinking ?? "") + buf.thinkingDelta,
        };
      }

      // Apply batched tool output deltas
      if (buf.toolOutputs.size > 0) {
        nextLast = {
          ...nextLast,
          toolCalls: (nextLast.toolCalls ?? []).map((card) => {
            const delta = buf.toolOutputs.get(card.toolCallId);
            return delta ? { ...card, output: (card.output ?? "") + delta } : card;
          }),
        };
      }

      const next = [...prev];
      next[next.length - 1] = nextLast;
      return next;
    });
  }, []);

  const scheduleFlush = React.useCallback(() => {
    if (flushRafRef.current) return;
    flushRafRef.current = requestAnimationFrame(flushBuffer);
  }, [flushBuffer]);

  // Clean up rAF on unmount / session switch
  React.useEffect(() => {
    return () => {
      if (flushRafRef.current) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = 0;
      }
      bufferRef.current = null;
    };
  }, [sessionPath]);

  // Load historical messages when session path changes
  React.useEffect(() => {
    if (!sessionPath) {
      setMessages([]);
      setSessionName(null);
      setError(null);
      return;
    }

    // Clear previous session's messages immediately so the user doesn't
    // see stale content while the new session loads.
    setMessages([]);
    setSessionName(null);
    setError(null);

    // User is looking at this session — clear the "new content" dot.
    markSessionViewed(sessionPath);

    let cancelled = false;
    setIsLoading(true);

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
            images: m.images,
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
          // Flush any pending batched tokens before finalizing
          if (flushRafRef.current) {
            cancelAnimationFrame(flushRafRef.current);
            flushRafRef.current = 0;
          }
          if (bufferRef.current) {
            flushBuffer();
          }
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

      // ── Batched delta handling ──────────────────────────────────────
      const assistantEvent = ev.assistantMessageEvent as
        | { type: string; delta?: string }
        | undefined;

      if (
        (ev.type === "message_delta" || ev.type === "message_update") &&
        assistantEvent
      ) {
        if (assistantEvent.type === "text_delta" && assistantEvent.delta) {
          if (!bufferRef.current) bufferRef.current = { textDelta: "", thinkingDelta: "", toolOutputs: new Map() };
          bufferRef.current.textDelta += assistantEvent.delta;
          scheduleFlush();
          return;
        }
        if (assistantEvent.type === "thinking_delta" && assistantEvent.delta) {
          if (!bufferRef.current) bufferRef.current = { textDelta: "", thinkingDelta: "", toolOutputs: new Map() };
          bufferRef.current.thinkingDelta += assistantEvent.delta;
          scheduleFlush();
          return;
        }
      }

      // Batch tool_execution_update deltas
      if (ev.type === "tool_execution_update") {
        const toolCallId = ev.toolCallId as string;
        const partial = resultText(ev.partialResult);
        if (toolCallId && partial) {
          if (!bufferRef.current) bufferRef.current = { textDelta: "", thinkingDelta: "", toolOutputs: new Map() };
          const existing = bufferRef.current.toolOutputs.get(toolCallId) ?? "";
          bufferRef.current.toolOutputs.set(toolCallId, existing + partial);
          scheduleFlush();
          return;
        }
      }

      // Non-delta events go through applySessionEvent directly
      setMessages((prev) => applySessionEvent(prev, ev, currentModel));
    });

    const unsubError = window.electron.onSessionError((err) => {
      const errorSessionFile = err._sessionFile ?? null;

      // Flush any pending tokens before showing error
      if (flushRafRef.current) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = 0;
      }
      if (bufferRef.current) {
        flushBuffer();
      }

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
  }, [sessionPath, currentModel, flushBuffer, scheduleFlush]);

  const sendMessage = React.useCallback(
    (overrideText?: string, images?: string[]) => {
      const text = (overrideText ?? inputRef.current).trim();
      if (!text && !images?.length) return;

      setInput("");
      inputRef.current = "";
      setError(null);

      const imagePayloads = images?.map((dataUrl) => {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return { data: dataUrl, mimeType: "image/png" };
        return { data: match[2]!, mimeType: match[1]! };
      });

      window.electron.sendPrompt(text, undefined, imagePayloads).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    []
  );

  const abort = React.useCallback(() => {
    // Flush pending tokens before aborting so the user sees partial output
    if (flushRafRef.current) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = 0;
    }
    if (bufferRef.current) {
      flushBuffer();
    }
    window.electron.abortSession().catch(() => {});
    if (sessionPath) setSessionStreaming(sessionPath, false);
  }, [sessionPath, flushBuffer]);

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

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "output" in result) {
    return String((result as { output?: unknown }).output ?? "");
  }
  return "";
}
