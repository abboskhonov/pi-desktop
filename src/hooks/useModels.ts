import * as React from "react";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
}

let cachedPromise: Promise<ModelInfo[]> | null = null;
const MODELS_REFRESH_EVENT = "pi-models-refresh";

function getModels(): Promise<ModelInfo[]> {
  if (!cachedPromise) {
    console.log('[useModels] fetching models from sidecar');
    cachedPromise = window.electron.getModels().then((list) => {
      console.log('[useModels] got models:', list.map((m) => m.id));
      return list;
    }).catch((err) => {
      cachedPromise = null;
      throw err;
    });
  } else {
    console.log('[useModels] returning cached models');
  }
  return cachedPromise;
}

/** Clear the model cache and tell every mounted useModels() to re-fetch. */
export function refreshModels() {
  console.log('[useModels] refreshModels() called');
  cachedPromise = null;
  window.dispatchEvent(new Event(MODELS_REFRESH_EVENT));
}

export function useModels() {
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // Listen for global refresh signals (e.g. after extension install)
  React.useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener(MODELS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(MODELS_REFRESH_EVENT, handler);
  }, []);

  // Also refresh when sidecar comes back up (e.g. after extension install + restart)
  React.useEffect(() => {
    const unsub = window.electron.onSidecarReady(() => {
      console.log('[useModels] sidecar ready — refreshing models');
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  // Keep a ref to the latest selectedModelId so the async fetch callback
  // always sees the current value without adding it to effect deps.
  const selectedModelIdRef = React.useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;

  React.useEffect(() => {
    let cancelled = false;
    getModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        const currentId = selectedModelIdRef.current;
        // Only auto-select the first model if nothing is selected yet
        if (list.length > 0 && !currentId) {
          setSelectedModelId(list[0].id);
        }
        // If the previously selected model disappeared from the list, fall back
        if (currentId && !list.find((m) => m.id === currentId)) {
          setSelectedModelId(list[0]?.id ?? "");
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
  }, [tick]);

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
