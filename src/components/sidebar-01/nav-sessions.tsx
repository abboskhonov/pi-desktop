import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { SessionListItem } from "../../../types/electron-api";

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  if (diffD < 30) return `${Math.floor(diffD / 7)}w ago`;
  return `${Math.floor(diffD / 30)}mo ago`;
}

interface NavSessionsProps {
  sessions: SessionListItem[];
  activeSessionPath?: string;
  onSelectSession?: (path: string) => void;
}

export function NavSessions({ sessions, activeSessionPath, onSelectSession }: NavSessionsProps) {
  return (
    <SidebarGroup className="flex-1 overflow-hidden flex flex-col px-3 pt-2">
      {/* Section header */}
      <div className="flex items-center justify-between py-2 px-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Recent chats
        </span>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <IconAdjustmentsHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      <SidebarGroupContent className="flex-1 overflow-y-auto -mx-1">
        {sessions.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground/50 text-center">
            No sessions yet
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sessions.map((session) => {
              const isActive = session.path === activeSessionPath;
              return (
                <button
                  key={session.path}
                  onClick={() => onSelectSession?.(session.path)}
                  className={cn(
                    "w-full text-left flex flex-col gap-1 rounded-md px-2.5 py-2 transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">
                      {session.title || "Untitled"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                      {formatTimeAgo(session.updatedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
