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

  return (
    <SidebarProvider>
      <AppSidebar
        activeSessionPath={activeSessionPath}
        onSelectSession={(path) => setActiveSessionPath(path)}
      />
      <SidebarInset className="flex flex-col bg-background">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/40 px-4">
          <SidebarTrigger className="sm:hidden" />
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPane sessionPath={activeSessionPath} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
