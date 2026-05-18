import * as React from "react";
import { cn } from "@/lib/utils";
import {
  IconSparkles,
  IconChevronRight,
  IconTerminal2,
  IconAlertCircle,
} from "@tabler/icons-react";

interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  output?: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: number;
  thinking?: string;
  modelName?: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  /** Base64 data URLs for attached images */
  images?: string[];
}

/* ── Inline formatters ─────────────────────────────────────────────── */

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[13px] font-mono text-foreground/90">
      {children}
    </code>
  );
}

const InlineFormat = React.memo(function InlineFormat({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "code" | "bold" | "link"; content: string; href?: string }> = [];

  let remaining = text;
  const codeRegex = /`([^`]+)`/g;
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const matches: Array<{ start: number; end: number; type: "code" | "bold" | "link"; content: string; href?: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = codeRegex.exec(remaining)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: "code", content: m[1] });
  }
  while ((m = boldRegex.exec(remaining)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: "bold", content: m[1] });
  }
  while ((m = linkRegex.exec(remaining)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: "link", content: m[1], href: m[2] });
  }

  matches.sort((a, b) => a.start - b.start);

  const filtered: typeof matches = [];
  for (const match of matches) {
    const overlaps = filtered.some(
      (f) => (match.start >= f.start && match.start < f.end) || (f.start >= match.start && f.start < match.end)
    );
    if (!overlaps) filtered.push(match);
  }

  let pos = 0;
  for (const match of filtered) {
    if (match.start > pos) {
      parts.push({ type: "text", content: remaining.slice(pos, match.start) });
    }
    parts.push({ type: match.type, content: match.content, href: match.href });
    pos = match.end;
  }
  if (pos < remaining.length) {
    parts.push({ type: "text", content: remaining.slice(pos) });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content: remaining });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") return <InlineCode key={i}>{part.content}</InlineCode>;
        if (part.type === "bold") return <strong key={i} className="font-semibold text-foreground">{part.content}</strong>;
        if (part.type === "link") return <a key={i} href={part.href} className="text-primary underline underline-offset-2">{part.content}</a>;
        return <span key={i}>{part.content}</span>;
      })}
    </>
  );
});

const FormattedText = React.memo(function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const bulletMatch = line.match(/^(\s*)[\-\*]\s+(.*)$/);
        if (bulletMatch) {
          const indent = bulletMatch[1].length;
          const content = bulletMatch[2];
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: `${indent * 0.5}rem` }}>
              <span className="text-muted-foreground mt-1.5">•</span>
              <span className="flex-1"><InlineFormat text={content} /></span>
            </div>
          );
        }

        const numMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
        if (numMatch) {
          const indent = numMatch[1].length;
          const content = numMatch[2];
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: `${indent * 0.5}rem` }}>
              <span className="text-muted-foreground mt-1.5 text-xs">{line.match(/^(\s*)\d+\.\s+/)?.[0].trim()}</span>
              <span className="flex-1"><InlineFormat text={content} /></span>
            </div>
          );
        }

        return (
          <div key={i} className={line.trim() === "" ? "h-3" : "py-0.5"}>
            <InlineFormat text={line} />
          </div>
        );
      })}
    </>
  );
});

/* ── Thinking block ───────────────────────────────────────────────── */

const ThinkingBlock = React.memo(function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="my-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
      >
        <IconChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        Thinking
      </button>
      {open && (
        <div className="mt-1.5 pl-3 text-[12px] text-muted-foreground/50 leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </div>
      )}
    </div>
  );
});

/* ── Tool call row ───────────────────────────────────────────────── */

function ToolCallRow({ call }: { call: ToolCall }) {
  const filePath = (call.args.path as string) || (call.args.file as string);
  const command = call.args.command as string;
  const display = filePath
    ? filePath.split("/").slice(-2).join("/")
    : command
      ? command.slice(0, 60)
      : call.toolName;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px]",
        call.isError
          ? "text-destructive/70"
          : "text-muted-foreground/50"
      )}
    >
      {call.isError ? (
        <IconAlertCircle className="h-3 w-3" />
      ) : (
        <IconTerminal2 className="h-3 w-3" />
      )}
      <span className="capitalize">{call.toolName}</span>
      {display && <span className="truncate max-w-[180px] opacity-60">{display}</span>}
    </div>
  );
}

/* ── Streaming dots ──────────────────────────────────────────────── */

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "200ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: "400ms" }} />
    </div>
  );
}

/* ── Equality check ──────────────────────────────────────────────── */

function areMessagesEqual(prev: ChatMessage, next: ChatMessage): boolean {
  if (prev.id !== next.id) return false;
  if (prev.role !== next.role) return false;
  if (prev.text !== next.text) return false;
  if (prev.timestamp !== next.timestamp) return false;
  if (prev.thinking !== next.thinking) return false;
  if (prev.modelName !== next.modelName) return false;
  if (prev.streaming !== next.streaming) return false;

  const prevTC = prev.toolCalls ?? [];
  const nextTC = next.toolCalls ?? [];
  if (prevTC.length !== nextTC.length) return false;

  for (let i = 0; i < prevTC.length; i++) {
    const a = prevTC[i];
    const b = nextTC[i];
    if (
      a.toolCallId !== b.toolCallId ||
      a.output !== b.output ||
      a.isError !== b.isError ||
      a.streaming !== b.streaming ||
      a.toolName !== b.toolName
    ) {
      return false;
    }
  }

  return true;
}

/* ── Message component ───────────────────────────────────────────── */

export const Message = React.memo(function Message({ msg, isGrouped }: { msg: ChatMessage; isGrouped?: boolean }) {
  /* ── User message ────────────────────────────────────────────── */
  if (msg.role === "user") {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[78%] flex flex-col gap-2 items-end">
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {msg.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="rounded-xl max-h-[200px] max-w-[200px] object-cover border border-border/30"
                  loading="lazy"
                />
              ))}
            </div>
          )}
          {msg.text && (
            <div className="rounded-[20px] bg-muted px-5 py-3.5 text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
              {msg.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── System message ──────────────────────────────────────────── */
  if (msg.role === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="text-[11px] text-muted-foreground/40 uppercase tracking-wider">
          {msg.text}
        </span>
      </div>
    );
  }

  /* ── Assistant message ───────────────────────────────────────── */
  return (
    <div className="flex justify-start py-2">
      <div className="max-w-[88%]">
        {/* Agent icon + name header */}
        {!isGrouped && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <IconSparkles className="h-3.5 w-3.5 text-primary/70" />
            </div>
            <span className="text-[11px] text-muted-foreground/50 font-medium">
              {msg.modelName ?? "Assistant"}
            </span>
          </div>
        )}

        {/* Tool calls as subtle pills */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.toolCalls.map((call) => (
              <ToolCallRow key={call.toolCallId} call={call} />
            ))}
          </div>
        )}

        {/* Thinking block */}
        {msg.thinking && <ThinkingBlock text={msg.thinking} />}



        {/* Text content — plain during streaming, formatted when done */}
        {msg.text && (
          <div className="text-[15px] leading-[1.7] text-foreground/85 whitespace-pre-wrap break-words">
            {msg.streaming ? (
              <span>{msg.text}</span>
            ) : (
              <FormattedText text={msg.text} />
            )}
          </div>
        )}

        {/* Streaming indicator (no text yet) */}
        {msg.streaming && !msg.text && <StreamingDots />}
      </div>
    </div>
  );
}, (prevProps, nextProps) => areMessagesEqual(prevProps.msg, nextProps.msg) && prevProps.isGrouped === nextProps.isGrouped);
