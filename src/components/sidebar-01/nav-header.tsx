import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  IconSearch,
  IconChevronDown,
  IconPlus,
  IconBolt,
  IconHome,
  IconGitBranch,
  IconTerminal2,
  IconFolder,
} from "@tabler/icons-react";
import type { WorkspaceInfo } from "../../../types/electron-api";

const navItems = [
  { id: "new-session", title: "New Session", icon: IconHome, active: true },
  { id: "git", title: "Git", icon: IconGitBranch },
  { id: "terminal", title: "Terminal", icon: IconTerminal2 },
  { id: "files", title: "Files", icon: IconFolder },
];

export function NavHeader({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onAddWorkspace,
}: {
  workspaces: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  onSelectWorkspace: (path: string) => void;
  onAddWorkspace: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeNav, setActiveNav] = React.useState("new-session");

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <div className="flex flex-col gap-1 px-3 pt-3 pb-2">
      {/* Workspace switcher */}
      <div className="flex items-center justify-between px-1 mb-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            <IconBolt className="h-4 w-4 text-foreground" />
            <span className="truncate max-w-[140px]">
              {activeWorkspace?.displayName ?? "Select project"}
            </span>
            <IconChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.path}
                className="gap-2"
                onClick={() => onSelectWorkspace(ws.path)}
              >
                <IconFolder className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{ws.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {ws.sessionCount}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="gap-2 text-muted-foreground" onClick={onAddWorkspace}>
              <IconPlus className="h-4 w-4" />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <IconBolt className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm",
          "bg-background/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        )}
      >
        <IconSearch className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden lg:inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5 mt-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.title}</span>
            </button>
          );
        })}
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search sessions, files, commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Recent sessions">
            <CommandItem>Refactor sidebar</CommandItem>
            <CommandItem>Git panel integration</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Files">
            <CommandItem>package.json</CommandItem>
            <CommandItem>electron/main.ts</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
