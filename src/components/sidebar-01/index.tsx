import * as React from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar-01/app-sidebar";
import { ChatPane } from "@/components/chat/ChatPane";

export default function Sidebar01() {
  const [activeSessionPath, setActiveSessionPath] = React.useState<string | null>(null);
  const [activeWorkspacePath, setActiveWorkspacePath] = React.useState<string | null>(null);
  const pendingPromptRef = React.useRef<string | null>(null);
  const pendingModelRef = React.useRef<{ id: string; provider: string } | null>(null);

  React.useEffect(() => {
    const unsub = window.electron.onSessionReady((payload) => {
      if (payload.sessionFile) {
        setActiveSessionPath(payload.sessionFile);
      }
      if (pendingPromptRef.current) {
        window.electron.sendPrompt(pendingPromptRef.current).catch(console.error);
        pendingPromptRef.current = null;
      }
      if (pendingModelRef.current) {
        window.electron
          .setModel(pendingModelRef.current.provider, pendingModelRef.current.id)
          .catch(console.error);
        pendingModelRef.current = null;
      }
    });
    return unsub;
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar
        activeSessionPath={activeSessionPath}
        onSelectSession={(path) => setActiveSessionPath(path)}
        onWorkspaceChange={(path) => setActiveWorkspacePath(path)}
      />
      <SidebarInset className="flex flex-col bg-background">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/40 px-4">
          <SidebarTrigger className="sm:hidden" />
          {activeSessionPath && (
            <button
              onClick={() => setActiveSessionPath(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPane
            sessionPath={activeSessionPath}
            workspacePath={activeWorkspacePath}
            onStartSession={(text, model) => {
              if (!activeWorkspacePath) {
                console.warn("No active workspace to start a session in");
                return;
              }
              pendingPromptRef.current = text;
              if (model) pendingModelRef.current = model;
              window.electron.newSession(activeWorkspacePath).catch((err) => {
                console.error("Failed to start session:", err);
                pendingPromptRef.current = null;
                pendingModelRef.current = null;
              });
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
