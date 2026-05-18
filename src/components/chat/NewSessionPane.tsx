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
import { cn } from "@/lib/utils";
import {
  IconAlertTriangle,
  IconArrowUp,
  IconCloud,
  IconFileSpark,
  IconGauge,
  IconPhotoScan,
} from "@tabler/icons-react";

const QUICK_PROMPTS = [
  {
    icon: IconFileSpark,
    text: "Write documentation",
    prompt:
      "Write comprehensive documentation for this codebase, including setup instructions, API references, and usage examples.",
  },
  {
    icon: IconGauge,
    text: "Optimize performance",
    prompt:
      "Analyze the codebase for performance bottlenecks and suggest optimizations to improve loading times and runtime efficiency.",
  },
  {
    icon: IconAlertTriangle,
    text: "Find and fix 3 bugs",
    prompt:
      "Scan through the codebase to identify and fix 3 critical bugs, providing detailed explanations for each fix.",
  },
];

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
}

interface NewSessionPaneProps {
  onStartSession?: (text: string, model?: { id: string; provider: string }) => void;
  onSend?: (text: string) => void;
}

export function NewSessionPane({ onStartSession, onSend }: NewSessionPaneProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    window.electron
      .getModels()
      .then((list) => {
        setModels(list);
        if (list.length > 0) {
          setSelectedModelId(list[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputValue]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

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
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col items-center justify-end px-4 pb-8">
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        {/* Composer card */}
        <div className="flex min-h-[120px] flex-col rounded-2xl cursor-text bg-card border border-border shadow-lg">
          <div className="flex-1 relative overflow-y-auto max-h-[258px]">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              className="w-full border-0 p-4 transition-[padding] duration-200 ease-in-out min-h-[56px] outline-none text-[16px] text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent whitespace-pre-wrap break-words placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex min-h-[40px] items-center gap-2 p-3 pb-2">
            <div className="flex aspect-square items-center gap-1 rounded-full bg-muted p-1.5 text-xs">
              <IconCloud className="h-4 w-4 text-muted-foreground" />
            </div>

            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="w-fit border-none bg-transparent p-0 text-sm text-muted-foreground hover:text-foreground focus:ring-0 shadow-none">
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
  );
}
