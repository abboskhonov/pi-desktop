import * as React from "react";
import { cn } from "@/lib/utils";
import { useModels } from "@/hooks/useModels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconArrowUp, IconPlayerStop } from "@tabler/icons-react";

interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onStop?: () => void;
  disabled?: boolean;
  currentModel?: string | null;
}

export function Composer({
  input,
  onInputChange,
  onSend,
  isStreaming,
  onStop,
  disabled,
  currentModel,
}: ComposerProps) {
  const {
    models,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
  } = useModels();

  // Sync with session's current model
  React.useEffect(() => {
    if (currentModel && models.length > 0) {
      const match = models.find((m) => m.name === currentModel);
      if (match) setSelectedModelId(match.id);
    }
  }, [currentModel, models, setSelectedModelId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSend();
      }
    }
  };

  const handleModelChange = (value: string) => {
    setSelectedModelId(value);
    const model = models.find((m) => m.id === value);
    if (model) {
      window.electron.setModel(model.provider, model.id).catch(console.error);
    }
  };

  return (
    <div className="shrink-0 border-t border-border/30 bg-background/80 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="relative rounded-xl border border-border/60 bg-muted/20 focus-within:border-border transition-colors">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything. @tag files/folders, $use skills, or / for commands"
            rows={1}
            disabled={disabled || isStreaming}
            className={cn(
              "w-full resize-none bg-transparent px-3 py-2.5 pr-12 text-[14px] outline-none",
              "placeholder:text-muted-foreground/50",
              "min-h-[44px] max-h-[160px] field-sizing-content"
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
            {models.length > 0 ? (
              <Select value={selectedModelId} onValueChange={handleModelChange}>
                <SelectTrigger className="w-fit border-none bg-transparent p-0 text-[11px] text-muted-foreground/70 hover:text-muted-foreground focus:ring-0 shadow-none h-auto gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/50" />
                  <SelectValue placeholder="Model">
                    <span>{selectedModel?.name ?? currentModel ?? "Model"}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className="text-sm">{model.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {model.provider}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-[11px] text-muted-foreground/40">
                {currentModel ?? "Loading models..."}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/40">
            Shift + Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
