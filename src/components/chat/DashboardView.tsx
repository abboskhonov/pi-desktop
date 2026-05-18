import * as React from "react"
import { cn } from "@/lib/utils"
import { useModels } from "@/hooks/useModels"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconArrowUp,
  IconGitBranch,
  IconSearch,
  IconFilter,
  IconArrowsSort,
  IconRobot,
  IconCheck,
  IconCloud,
  IconPhotoScan,
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

  const filteredSessions = React.useMemo(
    () => sessions.filter((s) =>
      (s.title || "").toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [sessions, searchQuery]
  )

  const allChecked = React.useMemo(
    () => filteredSessions.length > 0 && filteredSessions.every((s) => checkedSessions.has(s.path)),
    [filteredSessions, checkedSessions]
  )
  const someChecked = React.useMemo(
    () => filteredSessions.some((s) => checkedSessions.has(s.path)) && !allChecked,
    [filteredSessions, checkedSessions, allChecked]
  )

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
      <div className="shrink-0 overflow-y-auto max-h-[55vh]">
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
                  <TimeAgo iso={session.updatedAt} />
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

      {/* Composer — vertically centered in remaining space */}
      <div className="flex-1 flex flex-col justify-center min-h-0 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex min-h-[120px] flex-col rounded-2xl cursor-text bg-card border border-border">
            <div className="flex-1 relative overflow-y-auto max-h-[258px]">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Captain Copy..."
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
                  disabled={!input.trim()}
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
              </div>
            </div>
          </div>
        </div>

        {/* Quick prompts */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              variant="ghost"
              className="group flex items-center gap-2 rounded-full border px-3 py-2 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-muted/30 h-auto bg-transparent dark:bg-muted"
              onClick={() => setInput(prompt)}
            >
              <span>{prompt}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

const TimeAgo = React.memo(function TimeAgo({ iso }: { iso: string }) {
  const text = React.useMemo(() => {
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
  }, [iso])

  return (
    <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
      {text}
    </span>
  )
})
