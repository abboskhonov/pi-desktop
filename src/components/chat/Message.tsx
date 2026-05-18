import * as React from "react";
import { cn } from "@/lib/utils";

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
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[13px] font-mono text-foreground/90">
      {children}
    </code>
  );
}

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
        "flex items-center gap-2 py-1 text-[13px]",
        call.isError ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <span className="text-xs">▸</span>
      <span className="capitalize">{call.toolName}</span>
      {display && (
        <span className="truncate text-xs opacity-70">{display}</span>
      )}
    </div>
  );
}

const ThinkingBlock = React.memo(function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className={cn("transition-transform", open && "rotate-90")}>▶</span>
        Thinking
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border/30 bg-muted/20 p-2 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </div>
      )}
    </div>
  );
});

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

export const Message = React.memo(function Message({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="py-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
            {msg.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <div className="max-w-3xl mx-auto">
        {/* Tool calls as compact rows */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mb-1 space-y-0">
            {msg.toolCalls.map((call) => (
              <ToolCallRow key={call.toolCallId} call={call} />
            ))}
          </div>
        )}

        {/* Thinking */}
        {msg.thinking && <ThinkingBlock text={msg.thinking} />}

        {/* Response divider */}
        {msg.toolCalls && msg.toolCalls.length > 0 && msg.text && (
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
              Response
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        )}

        {/* Text content — render plain text while streaming to avoid regex cost on every token */}
        {msg.text && (
          <div className="text-[14px] leading-[1.7] text-foreground/85 whitespace-pre-wrap break-words">
            {msg.streaming ? (
              <span>{msg.text}</span>
            ) : (
              <FormattedText text={msg.text} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => areMessagesEqual(prevProps.msg, nextProps.msg));
