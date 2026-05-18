import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useModels } from "@/hooks/useModels";
import { cn } from "@/lib/utils";
import {
  IconArrowUp,
  IconCloud,
  IconPhotoScan,
  IconPlayerStop,
} from "@tabler/icons-react";

interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onStop?: () => void;
  disabled?: boolean;
  currentModel?: string | null;
}

export const Composer = React.memo(function Composer({
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
    <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent">
      <div className="max-w-3xl mx-auto py-3">
        {/* Composer card */}
        <div className="flex min-h-[120px] flex-col rounded-2xl cursor-text bg-card border border-border">
          <div className="flex-1 relative overflow-y-auto max-h-[258px]">
            <Textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything. @tag files/folders, $use skills, or / for commands"
              rows={1}
              disabled={disabled || isStreaming}
              className="w-full border-0 p-3 bg-transparent! transition-[padding] duration-200 ease-in-out min-h-[48.4px] outline-none text-[16px] text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 whitespace-pre-wrap break-words placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex min-h-[40px] items-center gap-2 p-2 pb-1">
            <div className="flex aspect-square items-center gap-1 rounded-full bg-muted p-1.5 text-xs">
              <IconCloud className="h-4 w-4 text-muted-foreground" />
            </div>

            {models.length > 0 ? (
              <Select value={selectedModelId} onValueChange={handleModelChange}>
                <SelectTrigger className="w-fit border-none bg-transparent! p-0 text-sm text-muted-foreground hover:text-foreground focus:ring-0 shadow-none h-auto gap-1">
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
              <span className="text-sm text-muted-foreground/40">
                {currentModel ?? "Loading models..."}
              </span>
            )}

            <div className="ml-auto flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground transition-colors duration-100 ease-out"
                title="Attach images"
                aria-label="Attach images"
              >
                <IconPhotoScan className="h-5 w-5" />
              </Button>

              {isStreaming ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onStop}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  aria-label="Stop generation"
                >
                  <IconPlayerStop className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onSend}
                  disabled={!input.trim() || disabled}
                  className={cn(
                    "rounded-full transition-colors duration-100 ease-out cursor-pointer",
                    input.trim()
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  aria-label="Send message"
                >
                  <IconArrowUp className="h-4 w-4 text-primary-foreground" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar: shortcuts */}
        <div className="flex items-center justify-end mt-1.5 px-1">
          <span className="text-[10px] text-muted-foreground/40">
            Shift + Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
});
