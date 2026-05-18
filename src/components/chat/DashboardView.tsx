import * as React from "react"
import { cn } from "@/lib/utils"
import { useModels } from "@/hooks/useModels"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconPlus,
  IconArrowUp,
  IconGitBranch,
  IconSearch,
  IconFilter,
  IconArrowsSort,
  IconRobot,
  IconCheck,
} from "@tabler/icons-react"
import type { SessionListItem } from "../../../types/electron-api"

const QUICK_PROMPTS = [
  "Summarize latest changes",
  "Review my latest PR",
  "Suggest a new feature...",
  "Create a task for...",
]

interface DashboardViewProps {
  sessions: SessionListItem[]
  onStartSession: (text: string, model?: { id: string; provider: string }) => void
  onOpenSession: (path: string) => void
  activeWorkspacePath: string | null
}

export function DashboardView({
  sessions,
  onStartSession,
  onOpenSession,
  activeWorkspacePath,
}: DashboardViewProps) {
  const [input, setInput] = React.useState("")
  const { models, selectedModelId, setSelectedModelId, selectedModel } = useModels()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [checkedSessions, setCheckedSessions] = React.useState<Set<string>>(new Set())

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    const model = selectedModel
      ? { id: selectedModel.id, provider: selectedModel.provider }
      : undefined
    onStartSession(text, model)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const filteredSessions = sessions.filter((s) =>
    (s.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  const allChecked =
    filteredSessions.length > 0 && filteredSessions.every((s) => checkedSessions.has(s.path))
  const someChecked =
    filteredSessions.some((s) => checkedSessions.has(s.path)) && !allChecked

  const toggleAll = () => {
    if (allChecked) {
      const next = new Set(checkedSessions)
      filteredSessions.forEach((s) => next.delete(s.path))
      setCheckedSessions(next)
    } else {
      const next = new Set(checkedSessions)
      filteredSessions.forEach((s) => next.add(s.path))
      setCheckedSessions(next)
    }
  }

  const toggleSession = (path: string) => {
    const next = new Set(checkedSessions)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setCheckedSessions(next)
  }

  const workspaceName = activeWorkspacePath
    ? activeWorkspacePath.split("/").pop() || "workspace"
    : "workspace"

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Workspace header */}
        <div className="px-6 pt-5 pb-2 flex items-center gap-2 shrink-0">
          <IconGitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{workspaceName}</span>
        </div>

        {/* Thread list */}
        <div className="px-6 py-4 max-w-4xl mx-auto w-full">
          {/* Search and filter */}
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-border/20 bg-muted/10 px-3 py-2">
              <IconSearch className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search threads..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/20 bg-muted/10 text-muted-foreground hover:text-foreground transition-colors">
              <IconArrowsSort className="h-4 w-4" />
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/20 bg-muted/10 text-muted-foreground hover:text-foreground transition-colors">
              <IconFilter className="h-4 w-4" />
            </button>
          </div>

          {/* Thread list header */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <button
              onClick={toggleAll}
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                allChecked || someChecked
                  ? "bg-foreground border-foreground"
                  : "border-border/40 bg-transparent"
              )}
            >
              {allChecked && <IconCheck className="h-3 w-3 text-background" />}
              {someChecked && <div className="h-2 w-2 rounded-sm bg-background" />}
            </button>
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium">Open threads</span>
            <span className="text-xs text-muted-foreground ml-1">{filteredSessions.length}</span>
          </div>

          {/* Threads */}
          <div className="flex flex-col gap-1.5">
            {filteredSessions.map((session) => (
              <button
                key={session.path}
                onClick={() => onOpenSession(session.path)}
                className="flex flex-col gap-1 rounded-lg border border-border/10 bg-muted/[0.04] px-3 py-2.5 text-left hover:bg-muted/[0.08] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSession(session.path)
                    }}
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border cursor-pointer transition-colors",
                      checkedSessions.has(session.path)
                        ? "bg-foreground border-foreground"
                        : "border-border/40 bg-transparent"
                    )}
                  >
                    {checkedSessions.has(session.path) && (
                      <IconCheck className="h-3 w-3 text-background" />
                    )}
                  </span>
                  <IconRobot className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">
                    {session.title || "Untitled"}
                  </span>
                  <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
                    {formatTimeAgo(session.updatedAt)}
                  </span>
                </div>
                <div className="ml-6">
                  <span className="inline-block rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                    {session.workspacePath
                      .split("/")
                      .pop()
                      ?.slice(0, 12)
                      ?.toUpperCase() || "SESSION"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed bottom composer */}
      <div className="shrink-0 border-t border-border/15 bg-background/80 backdrop-blur-xl px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-border/30 bg-card/90 shadow-sm overflow-hidden">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Captain Copy..."
              className="w-full border-0 bg-transparent p-4 text-[15px] text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[56px] max-h-[200px] placeholder:text-muted-foreground/50"
            />
            <div className="flex items-center gap-2 px-3 pb-3">
              <button className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                <IconPlus className="h-4 w-4" />
              </button>

              <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                <SelectTrigger className="w-fit border-none bg-transparent p-0 text-xs text-muted-foreground hover:text-foreground focus:ring-0 shadow-none h-auto gap-1">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="text-sm">{m.name}</span>
                      <span className="text-muted-foreground block text-xs">{m.provider}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    input.trim()
                      ? "bg-teal-600 text-white hover:bg-teal-500"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <IconArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick prompts */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setInput(prompt)
              }}
              className="rounded-full border border-border/30 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

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
