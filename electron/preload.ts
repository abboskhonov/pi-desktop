import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  ElectronAPI,
  WorkspaceInfo,
  SessionListItem,
  AddWorkspaceResult,
  SessionReadyPayload,
} from '../types/electron-api'

const api: ElectronAPI = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('get-app-info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Workspaces & Sessions
  getWorkspaces: (): Promise<WorkspaceInfo[]> => ipcRenderer.invoke('get-workspaces'),
  getSessions: (workspacePath: string): Promise<SessionListItem[]> =>
    ipcRenderer.invoke('get-sessions', workspacePath),
  addWorkspace: (): Promise<AddWorkspaceResult> => ipcRenderer.invoke('add-workspace'),
  removeWorkspace: (path: string): Promise<void> => ipcRenderer.invoke('remove-workspace', path),
  openSession: (path: string): Promise<void> => ipcRenderer.invoke('open-session', path),
  newSession: (cwd?: string): Promise<void> => ipcRenderer.invoke('new-session', cwd),
  getSessionMessages: (path: string): Promise<{
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
  }> => ipcRenderer.invoke('get-session-messages', path),

  renameSession: (path: string, newTitle: string): Promise<void> =>
    ipcRenderer.invoke('rename-session', path, newTitle),
  deleteSession: (path: string): Promise<void> =>
    ipcRenderer.invoke('delete-session', path),
  pinSession: (path: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('pin-session', path, pinned),

  // Chat / Agent
  sendPrompt: (text: string, contextPrefix?: string): Promise<void> =>
    ipcRenderer.invoke('send-prompt', text, contextPrefix),
  sendSteer: (text: string, contextPrefix?: string): Promise<void> =>
    ipcRenderer.invoke('send-steer', text, contextPrefix),
  sendFollowUp: (text: string, contextPrefix?: string): Promise<void> =>
    ipcRenderer.invoke('send-follow-up', text, contextPrefix),
  abortSession: (): Promise<void> => ipcRenderer.invoke('abort-session'),
  getModels: (): Promise<Array<{ id: string; name: string; provider: string; reasoning: boolean; contextWindow: number }>> =>
    ipcRenderer.invoke('get-models'),
  setModel: (provider: string, modelId: string): Promise<void> =>
    ipcRenderer.invoke('set-model', provider, modelId),
  setThinking: (level: string): Promise<void> =>
    ipcRenderer.invoke('set-thinking', level),
  getInstalledSkills: (): Promise<Array<{ name: string; description: string; path: string; source: string }>> =>
    ipcRenderer.invoke('get-installed-skills'),

  searchSkills: (query: string): Promise<{ skills: Array<{ id: string; skillId: string; name: string; installs: number; source: string }> }> =>
    ipcRenderer.invoke('search-skills', query),

  installSkill: (spec: string, global: boolean, cwd?: string): Promise<{ success: boolean; stdout: string; stderr: string }> =>
    ipcRenderer.invoke('install-skill', spec, global, cwd),

  searchExtensions: (query: string): Promise<{ packages: Array<{ name: string; description: string; version: string; keywords?: string[] }> }> =>
    ipcRenderer.invoke('search-extensions', query),

  installExtension: (packageName: string): Promise<{ success: boolean; stdout: string; stderr: string }> =>
    ipcRenderer.invoke('install-extension', packageName),

  getSessionStats: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('get-session-stats'),

  restartSidecar: (): Promise<void> => ipcRenderer.invoke('restart-sidecar'),

  // Window controls
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window-minimize'),
  windowMaximize: (): Promise<void> => ipcRenderer.invoke('window-maximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window-close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback: (isMaximized: boolean) => void): (() => void) => {
    const handler = (_event: unknown, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximized', handler)
    return () => {
      ipcRenderer.removeListener('window-maximized', handler)
    }
  },

  // Events
  onSessionIndexUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('session-index-updated', handler)
    return () => {
      ipcRenderer.removeListener('session-index-updated', handler)
    }
  },
  onSessionReady: (callback: (payload: SessionReadyPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: SessionReadyPayload) => callback(payload)
    ipcRenderer.on('session-ready', handler)
    return () => {
      ipcRenderer.removeListener('session-ready', handler)
    }
  },
  onSessionEvent: (callback: (event: Record<string, unknown>) => void): (() => void) => {
    const handler = (_event: unknown, event: Record<string, unknown>) => callback(event)
    ipcRenderer.on('session-event', handler)
    return () => {
      ipcRenderer.removeListener('session-event', handler)
    }
  },
  onSessionError: (callback: (err: { message: string; code?: string; _sessionFile?: string | null; _sessionId?: string | null }) => void): (() => void) => {
    const handler = (_event: unknown, err: { message: string; code?: string; _sessionFile?: string | null; _sessionId?: string | null }) => callback(err)
    ipcRenderer.on('session-error', handler)
    return () => {
      ipcRenderer.removeListener('session-error', handler)
    }
  },
}

contextBridge.exposeInMainWorld('electron', api)
