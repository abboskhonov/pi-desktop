import * as React from "react";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { NavHeader } from "@/components/sidebar-01/nav-header";
import { NavSessions } from "@/components/sidebar-01/nav-sessions";
import type { WorkspaceInfo, SessionListItem } from "../../../types/electron-api";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeSessionPath: string | null;
  onSelectSession: (path: string) => void;
  onWorkspaceChange?: (path: string | null) => void;
}

export function AppSidebar({
  activeSessionPath,
  onSelectSession,
  onWorkspaceChange,
  ...props
}: AppSidebarProps) {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceInfo[]>([]);
  const [activeWorkspacePath, setActiveWorkspacePath] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionListItem[]>([]);

  // Load workspaces on mount
  React.useEffect(() => {
    const load = async () => {
      const list = await window.electron.getWorkspaces();
      setWorkspaces(list);
      if (list.length > 0 && !activeWorkspacePath) {
        setActiveWorkspacePath(list[0].path);
      }
    };
    load();
  }, []);

  // Notify parent of workspace changes
  React.useEffect(() => {
    onWorkspaceChange?.(activeWorkspacePath);
  }, [activeWorkspacePath]);

  // Load sessions when active workspace changes
  React.useEffect(() => {
    if (!activeWorkspacePath) return;
    const load = async () => {
      const list = await window.electron.getSessions(activeWorkspacePath);
      setSessions(list);
    };
    load();
  }, [activeWorkspacePath]);

  // Listen for session index updates
  React.useEffect(() => {
    const unsubscribe = window.electron.onSessionIndexUpdated(() => {
      window.electron.getWorkspaces().then((list) => {
        setWorkspaces(list);
        if (activeWorkspacePath) {
          window.electron.getSessions(activeWorkspacePath).then(setSessions);
        }
      });
    });
    return unsubscribe;
  }, [activeWorkspacePath]);

  const activeWorkspace = workspaces.find((w) => w.path === activeWorkspacePath);

  return (
    <Sidebar {...props} collapsible="icon" className="border-r border-border/40">
      <SidebarContent className="flex flex-col gap-0 overflow-hidden">
        <NavHeader
          workspaces={workspaces}
          sessions={sessions}
          activeWorkspace={activeWorkspace ?? null}
          onSelectWorkspace={(path) => {
            setActiveWorkspacePath(path);
          }}
          onSelectSession={onSelectSession}
          onAddWorkspace={async () => {
            const result = await window.electron.addWorkspace();
            if (!result.cancelled && result.path) {
              setActiveWorkspacePath(result.path);
            }
          }}
          onNewSession={async () => {
            if (!activeWorkspacePath) {
              console.warn("No active workspace to start a session in");
              return;
            }
            await window.electron.newSession(activeWorkspacePath);
          }}
        />
        <NavSessions
          sessions={sessions}
          activeSessionPath={activeSessionPath ?? undefined}
          onSelectSession={onSelectSession}
        />
      </SidebarContent>
    </Sidebar>
  );
}
