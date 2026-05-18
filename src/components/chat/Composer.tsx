import * as React from "react";
import { cn } from "@/lib/utils";
import { IconArrowUp, IconPlayerStop } from "@tabler/icons-react";

interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onStop?: () => void;
  disabled?: boolean;
}

export function Composer({
  input,
  onInputChange,
  onSend,
  isStreaming,
  onStop,
  disabled,
}: ComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-border/30 bg-background">
      <div className="max-w-3xl mx-auto px-3 py-2">
        <div className="relative rounded-xl border border-border/60 bg-muted/20 focus-within:border-border transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything. @tag files/folders, $use skills, or / for commands"
            rows={1}
            disabled={disabled || isStreaming}
            className={cn(
              "w-full resize-none bg-transparent px-3 py-2.5 pr-12 text-[14px] outline-none",
              "placeholder:text-muted-foreground/50",
              "min-h-[44px] max-h-[160px]"
            )}
          />

          {/* Send / Stop button */}
          <div className="absolute bottom-2 right-2">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <IconPlayerStop className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim() || disabled}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  input.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <IconArrowUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom bar: model selector + shortcuts */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/50" />
              openai/gpt-5
              <span className="text-[10px]">▼</span>
            </button>
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors">
              <span>🔒</span>
              Full access
              <span className="text-[10px]">▼</span>
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground/40">
            Shift + Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
