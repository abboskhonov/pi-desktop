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
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { TokenStatsBar, useSessionStats } from "./TokenStatsBar";

interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: (text: string, images?: string[]) => void;
  isStreaming: boolean;
  onStop?: () => void;
  disabled?: boolean;
  currentModel?: string | null;
}

interface ModelSelectProps {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    reasoning: boolean;
    contextWindow: number;
  }>;
  selectedModelId: string;
  onSelect: (model: {
    id: string;
    name: string;
    provider: string;
    reasoning: boolean;
    contextWindow: number;
  }) => void;
}

function groupByProvider(models: ModelSelectProps["models"]) {
  const groups = new Map<string, typeof models>();
  for (const m of models) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }
  return groups;
}

function ModelSelect({ models, selectedModelId, onSelect }: ModelSelectProps) {
  const selected = models.find((m) => m.id === selectedModelId);
  const groups = React.useMemo(() => groupByProvider(models), [models]);
  const providers = Array.from(groups.keys()).sort();

  return (
    <Select
      value={selectedModelId}
      onValueChange={(value) => {
        const model = models.find((m) => m.id === value);
        if (model) onSelect(model);
      }}
    >
      <SelectTrigger className="w-fit border-none bg-transparent! p-0 text-sm text-muted-foreground hover:text-foreground focus:ring-0 shadow-none h-auto gap-1">
        <SelectValue placeholder="Model">
          {selected ? (
            <span className="text-sm">{selected.name}</span>
          ) : (
            <span>Model</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {providers.map((provider) => (
          <React.Fragment key={provider}>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              {provider}
            </div>
            {groups.get(provider)?.map((model) => (
              <SelectItem key={model.id} value={model.id} className="py-2 pl-3">
                <span className="text-sm font-medium">{model.name}</span>
              </SelectItem>
            ))}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
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
  const { stats } = useSessionStats();

  // Sync with session's current model
  React.useEffect(() => {
    if (currentModel && models.length > 0) {
      const match = models.find((m) => m.name === currentModel);
      if (match) setSelectedModelId(match.id);
    }
  }, [currentModel, models, setSelectedModelId]);

  const [images, setImages] = React.useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = React.useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newImages.push(dataUrl);
    }
    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
    }
  }, []);

  const removeImage = React.useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (input.trim() || images.length > 0)) {
        onSend(input, images.length > 0 ? images : undefined);
        setImages([]);
      }
    }
  };

  const handlePaste = React.useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      e.preventDefault();
      void handleFiles(files);
    }
  }, [handleFiles]);

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent">
      <div className="py-3">
        {/* Composer card */}
        <div
          className="flex min-h-[120px] flex-col rounded-2xl cursor-text bg-card border border-border"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {images.map((src, i) => (
                <div key={i} className="relative group">
                  <img
                    src={src}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover border border-border/30"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <IconX className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1 relative overflow-y-auto max-h-[258px]">
            <Textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
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
              <ModelSelect
                models={models}
                selectedModelId={selectedModelId}
                onSelect={(model) => {
                  setSelectedModelId(model.id);
                  window.electron.setModel(model.provider, model.id).catch(console.error);
                }}
              />
            ) : (
              <span className="text-sm text-muted-foreground/40">
                {currentModel ?? "Loading models..."}
              </span>
            )}

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

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
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
                  onClick={() => {
                    onSend(input, images.length > 0 ? images : undefined);
                    setImages([]);
                  }}
                  disabled={(!input.trim() && images.length === 0) || disabled}
                  className={cn(
                    "rounded-full transition-colors duration-100 ease-out cursor-pointer",
                    input.trim() || images.length > 0
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

        {/* Bottom bar: token stats */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <TokenStatsBar stats={stats} contextWindow={selectedModel?.contextWindow} />
          <span className="text-[10px] text-muted-foreground/40">
            Shift + Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
});
