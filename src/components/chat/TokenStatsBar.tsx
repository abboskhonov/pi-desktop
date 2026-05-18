import * as React from "react";
import { cn } from "@/lib/utils";

interface SessionStats {
  contextUsagePercent?: number | null;
  contextWindow?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function useSessionStats(pollInterval = 3000) {
  const [stats, setStats] = React.useState<SessionStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const raw = await window.electron.getSessionStats();
        if (cancelled) return;
        setStats({
          contextUsagePercent: raw.contextUsagePercent as number | null | undefined,
          contextWindow: raw.contextWindow as number | null | undefined,
          inputTokens: raw.inputTokens as number | undefined,
          outputTokens: raw.outputTokens as number | undefined,
          totalTokens: raw.totalTokens as number | undefined,
          cost: raw.cost as number | undefined,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, pollInterval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollInterval]);

  return { stats, error };
}

interface TokenStatsBarProps {
  stats: SessionStats | null;
  contextWindow?: number;
  className?: string;
}

export function TokenStatsBar({ stats, contextWindow, className }: TokenStatsBarProps) {
  if (!stats) {
    return (
      <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground/30", className)}>
        <span>—</span>
      </div>
    );
  }

  const parts: React.ReactNode[] = [];

  // Context usage: 37%/262k
  const ctxPct = stats.contextUsagePercent ?? null;
  const ctxLimit = (stats.contextWindow && stats.contextWindow > 0)
    ? stats.contextWindow
    : (contextWindow && contextWindow > 0 ? contextWindow : null);
  if (ctxPct != null && ctxLimit != null) {
    const pct = Math.round(ctxPct);
    parts.push(
      <span key="ctx" className="inline-flex items-center gap-1">
        <span className={cn("font-medium", pct > 90 ? "text-destructive" : pct > 70 ? "text-amber-500" : "text-muted-foreground")}>
          {pct}%
        </span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-muted-foreground/50">{formatTokens(ctxLimit)}</span>
      </span>
    );
  }

  // Input tokens: ↑521.1k
  if (stats.inputTokens != null) {
    parts.push(
      <span key="in" className="inline-flex items-center gap-0.5 text-muted-foreground/60">
        ↑{formatTokens(stats.inputTokens)}
      </span>
    );
  }

  // Output tokens: ↓58.6k
  if (stats.outputTokens != null) {
    parts.push(
      <span key="out" className="inline-flex items-center gap-0.5 text-muted-foreground/60">
        ↓{formatTokens(stats.outputTokens)}
      </span>
    );
  }

  // Total: Σ579.7k
  if (stats.totalTokens != null) {
    parts.push(
      <span key="total" className="inline-flex items-center gap-0.5 text-muted-foreground/60">
        Σ{formatTokens(stats.totalTokens)}
      </span>
    );
  }

  // Cost: $0.000
  if (stats.cost != null) {
    parts.push(
      <span key="cost" className="inline-flex items-center gap-0.5 text-muted-foreground/60">
        {formatCost(stats.cost)}
      </span>
    );
  }

  if (parts.length === 0) {
    return (
      <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground/30", className)}>
        <span>—</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] tabular-nums", className)}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-muted-foreground/20">·</span>}
          {part}
        </React.Fragment>
      ))}
    </div>
  );
}
