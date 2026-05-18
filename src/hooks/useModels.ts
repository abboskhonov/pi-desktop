import * as React from "react";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
}

let cachedPromise: Promise<ModelInfo[]> | null = null;

function getModels(): Promise<ModelInfo[]> {
  if (!cachedPromise) {
    cachedPromise = window.electron.getModels().catch((err) => {
      cachedPromise = null;
      throw err;
    });
  }
  return cachedPromise;
}

export function useModels() {
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        if (list.length > 0 && !selectedModelId) {
          setSelectedModelId(list[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        console.error("Failed to load models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedModel = React.useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId]
  );

  return {
    models,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    error,
  };
}
