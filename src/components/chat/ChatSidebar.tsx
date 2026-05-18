import * as React from "react"
import { cn } from "@/lib/utils"
import {
  IconSearch,
  IconLayoutDashboard,
  IconGitPullRequest,
  IconBolt,
  IconMessageCircle,
  IconSparkles,
  IconSettings,
  IconUser,
  IconPlus,
  IconRobot,
  IconChevronDown,
} from "@tabler/icons-react"
import type { WorkspaceInfo, SessionListItem } from "../../../types/electron-api"

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { id: "prs", label: "PRs", icon: IconGitPullRequest, badge: 1 },
  { id: "automations", label: "Automations", icon: IconBolt },
  { id: "context", label: "Context", icon: IconMessageCircle },
  { id: "skills", label: "Skills", icon: IconSparkles },
]

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffD = Math.floor(diffH / 24)
  if (diffH < 1) return "just now"
  if (diffH < 24) return `${diffH}h`
  if (diffD < 7) return `${diffD}d`
  if (diffD < 30) return `${Math.floor(diffD / 7)}w`
  return `${Math.floor(diffD / 30)}mo`
}

interface ChatSidebarProps {
  activeSessionPath: string | null
  onSelectSession: (path: string) => void
  activeView: string
  onChangeView: (view: string) => void
  workspaces: WorkspaceInfo[]
  sessions: SessionListItem[]
  onAddWorkspace: () => void
}

export function ChatSidebar({
  activeSessionPath,
  onSelectSession,
  activeView,
  onChangeView,
  sessions,
  onAddWorkspace,
}: ChatSidebarProps) {
  const [searchOpen, setSearchOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const recentSessions = sessions.slice(0, 10)

  return (
    <aside className="relative w-[260px] flex flex-col bg-[#0c0c0c] border-r border-white/[0.06] text-foreground h-screen shrink-0">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground hover:bg-white/[0.06] transition-colors"
        >
          <IconSearch className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="hidden lg:inline-flex h-5 items-center rounded border border-white/[0.08] bg-white/[0.05] px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-md px-2.5 py-[7px] text-left text-sm transition-colors",
                isActive
                  ? "bg-white/[0.08] text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {typeof item.badge === "number" && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Recents */}
      <div className="mt-5 flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Recents
          </span>
          <button
            onClick={onAddWorkspace}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            title="Add workspace"
          >
            <IconPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {recentSessions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground/50 text-center">
              No sessions yet
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {recentSessions.map((session) => {
                const isActive = session.path === activeSessionPath
                return (
                  <button
                    key={session.path}
                    onClick={() => onSelectSession(session.path)}
                    className={cn(
                      "w-full text-left flex flex-col gap-1 rounded-md px-2.5 py-2 transition-colors",
                      isActive
                        ? "bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
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
                    <div className="flex items-center gap-1.5">
                      <IconRobot className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide">
                        {session.workspacePath.split("/").pop()?.slice(0, 12) || "Session"}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-white/[0.06] p-2 flex flex-col gap-0.5 shrink-0">
        <button
          onClick={() => onChangeView("settings")}
          className={cn(
            "flex items-center gap-2.5 w-full rounded-md px-2.5 py-[7px] text-left text-sm transition-colors",
            activeView === "settings"
              ? "bg-white/[0.08] text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          )}
        >
          <IconSettings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </button>
        <button className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-[7px] text-left text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
          <IconUser className="h-4 w-4 shrink-0" />
          <span>User</span>
          <IconChevronDown className="h-3 w-3 ml-auto" />
        </button>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSearchOpen(false)} />
          <div className="absolute top-4 left-3 right-3 rounded-xl border border-white/[0.08] bg-[#141414] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
              <IconSearch className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                placeholder="Search sessions, files, commands..."
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false)
                }}
              />
            </div>
            <div className="py-3 px-3 text-xs text-muted-foreground text-center">
              Type to search across your workspace
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
