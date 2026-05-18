import * as React from "react"
import { ChatSidebar } from "./ChatSidebar"
import { DashboardView } from "./DashboardView"
import { ChatPane } from "./ChatPane"
import type { WorkspaceInfo, SessionListItem } from "../../../types/electron-api"

export function ChatPage() {
  const [activeSessionPath, setActiveSessionPath] = React.useState<string | null>(null)
  const [view, setView] = React.useState("dashboard")
  const [workspaces, setWorkspaces] = React.useState<WorkspaceInfo[]>([])
  const [activeWorkspacePath, setActiveWorkspacePath] = React.useState<string | null>(null)
  const [sessions, setSessions] = React.useState<SessionListItem[]>([])
  const pendingPromptRef = React.useRef<string | null>(null)
  const pendingModelRef = React.useRef<{ id: string; provider: string } | null>(null)

  // Load workspaces on mount
  React.useEffect(() => {
    window.electron
      .getWorkspaces()
      .then((list) => {
        setWorkspaces(list)
        if (list.length > 0 && !activeWorkspacePath) {
          setActiveWorkspacePath(list[0].path)
        }
      })
      .catch(console.error)
  }, [])

  // Load all sessions
  React.useEffect(() => {
    window.electron
      .getSessions("")
      .then(setSessions)
      .catch(console.error)
  }, [])

  // Listen for session index updates
  React.useEffect(() => {
    const unsub = window.electron.onSessionIndexUpdated(() => {
      window.electron.getWorkspaces().then(setWorkspaces).catch(console.error)
      window.electron.getSessions("").then(setSessions).catch(console.error)
    })
    return unsub
  }, [])

  // Listen for session ready
  React.useEffect(() => {
    const unsub = window.electron.onSessionReady((payload) => {
      if (payload.sessionFile) {
        setActiveSessionPath(payload.sessionFile)
        setView("chat")
      }
      if (pendingPromptRef.current) {
        window.electron.sendPrompt(pendingPromptRef.current).catch(console.error)
        pendingPromptRef.current = null
      }
      if (pendingModelRef.current) {
        window.electron
          .setModel(pendingModelRef.current.provider, pendingModelRef.current.id)
          .catch(console.error)
        pendingModelRef.current = null
      }
    })
    return unsub
  }, [])

  const handleStartSession = (
    text: string,
    model?: { id: string; provider: string }
  ) => {
    if (!activeWorkspacePath) {
      window.electron
        .addWorkspace()
        .then((result) => {
          if (!result.cancelled && result.path) {
            setActiveWorkspacePath(result.path)
            pendingPromptRef.current = text
            if (model) pendingModelRef.current = model
            window.electron.newSession(result.path).catch((err) => {
              console.error("Failed to start session:", err)
              pendingPromptRef.current = null
              pendingModelRef.current = null
            })
          }
        })
        .catch(console.error)
      return
    }
    pendingPromptRef.current = text
    if (model) pendingModelRef.current = model
    window.electron.newSession(activeWorkspacePath).catch((err) => {
      console.error("Failed to start session:", err)
      pendingPromptRef.current = null
      pendingModelRef.current = null
    })
  }

  const handleOpenSession = (path: string) => {
    pendingPromptRef.current = null
    pendingModelRef.current = null
    setActiveSessionPath(path)
    setView("chat")
  }

  const handleBackToDashboard = () => {
    setActiveSessionPath(null)
    setView("dashboard")
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <ChatSidebar
        activeSessionPath={activeSessionPath}
        onSelectSession={handleOpenSession}
        activeView={view}
        onChangeView={(v) => {
          setView(v)
          if (v === "dashboard") {
            setActiveSessionPath(null)
          }
        }}
        workspaces={workspaces}
        sessions={sessions}
        onAddWorkspace={async () => {
          const result = await window.electron.addWorkspace()
          if (!result.cancelled && result.path) {
            setActiveWorkspacePath(result.path)
            window.electron.getWorkspaces().then(setWorkspaces).catch(console.error)
            window.electron.getSessions("").then(setSessions).catch(console.error)
          }
        }}
      />
      <main className="flex-1 overflow-hidden">
        {activeSessionPath ? (
          <div className="flex flex-col h-full">
            <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/40 px-4">
              <button
                onClick={handleBackToDashboard}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to dashboard
              </button>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs text-muted-foreground truncate">
                {activeSessionPath.split("/").pop()}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPane sessionPath={activeSessionPath} />
            </div>
          </div>
        ) : view === "dashboard" ? (
          <DashboardView
            sessions={sessions}
            onStartSession={handleStartSession}
            onOpenSession={handleOpenSession}
            activeWorkspacePath={activeWorkspacePath}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="text-4xl">🚧</span>
            <span className="text-sm font-medium capitalize">{view} coming soon</span>
          </div>
        )}
      </main>
    </div>
  )
}
