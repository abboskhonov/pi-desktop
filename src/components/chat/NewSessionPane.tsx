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
  IconRefresh,
} from "@tabler/icons-react";

const QUICK_PROMPTS = [
  {
    icon: IconCloud,
    text: "Explain this codebase",
    prompt:
      "Explain the structure and key components of this codebase. Focus on the architecture, main entry points, and how data flows through the system.",
  },
  {
    icon: IconCloud,
    text: "Write tests",
    prompt:
      "Write comprehensive unit tests for the most recently modified files in this codebase. Cover edge cases and error handling.",
  },
  {
    icon: IconCloud,
    text: "Refactor for clarity",
    prompt:
      "Refactor the most complex or duplicated code in this codebase for better readability and maintainability. Explain your changes.",
  },
];

interface NewSessionPaneProps {
  onStartSession?: (text: string, model?: { id: string; provider: string }) => void;
  onSend?: (text: string) => void;
}

export function NewSessionPane({ onStartSession, onSend }: NewSessionPaneProps) {
  const [inputValue, setInputValue] = React.useState("");
  const { models, selectedModelId, setSelectedModelId, selectedModel } = useModels();

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    if (onSend) {
      onSend(text);
      setInputValue("");
      return;
    }
    const model = selectedModel
      ? { id: selectedModel.id, provider: selectedModel.provider }
      : undefined;
    onStartSession?.(text, model);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col justify-center">
      <div className="shrink-0 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
          {/* Composer card */}
          <div className="flex min-h-[120px] flex-col rounded-2xl cursor-text bg-card border border-border">
            <div className="flex-1 relative overflow-y-auto max-h-[258px]">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything"
                className="w-full border-0 p-3 bg-transparent! transition-[padding] duration-200 ease-in-out min-h-[48.4px] outline-none text-[16px] text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 whitespace-pre-wrap break-words placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex min-h-[40px] items-center gap-2 p-2 pb-1">
              <div className="flex aspect-square items-center gap-1 rounded-full bg-muted p-1.5 text-xs">
                <IconCloud className="h-4 w-4 text-muted-foreground" />
              </div>

              <Select
                value={selectedModelId}
                onValueChange={(value) => {
                  setSelectedModelId(value);
                  const model = models.find((m) => m.id === value);
                  if (model) {
                    window.electron.setModel(model.provider, model.id).catch(console.error);
                  }
                }}
              >
                <SelectTrigger className="w-fit border-none bg-transparent! p-0 text-sm text-muted-foreground hover:text-foreground focus:ring-0 shadow-none h-auto gap-1">
                  <SelectValue placeholder="Select model">
                    <span>{selectedModel?.name ?? "Model"}</span>
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

              <div className="ml-auto flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => refreshModels()}
                  className="text-muted-foreground hover:text-foreground transition-colors duration-100 ease-out"
                  title="Refresh models"
                  aria-label="Refresh models"
                >
                  <IconRefresh className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground transition-colors duration-100 ease-out"
                  title="Attach images"
                  aria-label="Attach images"
                >
                  <IconPhotoScan className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={cn(
                    "rounded-full transition-colors duration-100 ease-out cursor-pointer",
                    inputValue.trim()
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  aria-label="Send message"
                >
                  <IconArrowUp className="h-4 w-4 text-primary-foreground" />
                </Button>
              </div>
            </div>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_PROMPTS.map((button) => {
              const IconComponent = button.icon;
              return (
                <Button
                  key={button.text}
                  variant="ghost"
                  className="group flex items-center gap-2 rounded-full border px-3 py-2 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-muted/30 h-auto bg-transparent dark:bg-muted"
                  onClick={() => handlePromptClick(button.prompt)}
                >
                  <IconComponent className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  <span>{button.text}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
