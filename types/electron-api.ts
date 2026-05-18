export interface AppInfo {
  version: string
  name: string
  platform: string
}

export interface WorkspaceInfo {
  path: string
  displayName: string
  lastOpenedAt: string | null
  sessionCount: number
}

export interface SessionListItem {
  path: string
  id: string
  workspacePath: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  active: boolean
  pinned: boolean
}

export interface AddWorkspaceResult {
  cancelled: boolean
  path?: string
}

export interface SessionReadyPayload {
  cwd: string
  sessionFile: string | null
  sessionId: string | null
  sessionName: string | null
  model: {
    id: string
    name: string
    provider: string
    reasoning: boolean
    contextWindow: number
  } | null
  thinkingLevel: string | null
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>
  openExternal: (url: string) => Promise<void>
  platform: string
  versions: {
    node: string
    chrome: string
    electron: string
  }

  // Workspaces & Sessions
  getWorkspaces: () => Promise<WorkspaceInfo[]>
  getSessions: (workspacePath: string) => Promise<SessionListItem[]>
  addWorkspace: () => Promise<AddWorkspaceResult>
  removeWorkspace: (path: string) => Promise<void>
  openSession: (path: string) => Promise<void>
  newSession: (cwd?: string) => Promise<void>
  getSessionMessages: (path: string) => Promise<{
    messages: Array<{
      id: string
      role: string
      text: string
      timestamp?: number
      toolCards?: Array<{
        toolCallId: string
        toolName: string
        args: Record<string, unknown>
        output?: string
        isError?: boolean
      }>
      thinking?: string
      modelName?: string
    }>
    sessionName: string | null
  }>

  // Chat / Agent
  sendPrompt: (text: string, contextPrefix?: string) => Promise<void>
  sendSteer: (text: string, contextPrefix?: string) => Promise<void>
  sendFollowUp: (text: string, contextPrefix?: string) => Promise<void>
  abortSession: () => Promise<void>
  getModels: () => Promise<Array<{ id: string; name: string; provider: string; reasoning: boolean; contextWindow: number }>>
  setModel: (provider: string, modelId: string) => Promise<void>
  setThinking: (level: string) => Promise<void>
  renameSession: (sessionPath: string, newTitle: string) => Promise<void>
  deleteSession: (sessionPath: string) => Promise<void>
  pinSession: (sessionPath: string, pinned: boolean) => Promise<void>

  getSessionStats: () => Promise<Record<string, unknown>>

  // Events
  onSessionIndexUpdated: (callback: () => void) => () => void
  onSessionReady: (callback: (payload: SessionReadyPayload) => void) => () => void
  onSessionEvent: (callback: (event: Record<string, unknown>) => void) => () => void
  onSessionError: (callback: (err: { message: string; code?: string }) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
