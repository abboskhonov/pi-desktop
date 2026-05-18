import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readWindowState, writeWindowState } from './window-state'
import { SessionIndexStore } from './sessionIndex'
import { readSessionMessages } from './sessionMessages'
import { PiSidecarHost, createRequestId } from './piSidecarHost'
import type { SidecarMessage, SessionReadyPayload } from './piSidecarHost'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

// ── Linux GPU fixes ─────────────────────────────────────────────────────────
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

// ─── State ─────────────────────────────────────────────────────────────────

type SessionState = {
  cwd: string
  sessionFile: string | null
  sessionId: string | null
}

let mainWindow: BrowserWindow | null = null
let sessionIndex: SessionIndexStore | null = null
let piSidecarHost: PiSidecarHost | null = null
let state: SessionState | null = null
let deferredWorkspace: string | null = null

function requireSidecar(): PiSidecarHost {
  if (!piSidecarHost) {
    piSidecarHost = new PiSidecarHost({
      onMessage: handleSidecarMessage,
      onCrash: () => {
        mainWindow?.webContents.send('session-error', {
          message: 'Pi sidecar crashed repeatedly.',
          code: 'pi_sidecar_crashed',
        })
      },
    })
    piSidecarHost.start()
  }
  return piSidecarHost
}

function handleSidecarMessage(msg: SidecarMessage): void {
  switch (msg.type) {
    case 'ready':
    case 'stopped':
      return

    case 'session_ready': {
      const payload = msg.payload
      state = {
        cwd: payload.cwd,
        sessionFile: payload.sessionFile,
        sessionId: payload.sessionId,
      }
      deferredWorkspace = null
      mainWindow?.webContents.send('session-ready', payload)
      return
    }

    case 'session_event': {
      mainWindow?.webContents.send('session-event', msg.event)
      return
    }

    case 'session_error':
      mainWindow?.webContents.send('session-error', {
        message: msg.message,
        ...(msg.code ? { code: msg.code } : {}),
      })
      return

    case 'output_append':
      return

    case 'error':
      console.error('[sidecar]', msg.message)
      return

    default:
      return
  }
}

async function startSession(
  cwd: string,
  options: { sessionFile?: string } = {}
): Promise<void> {
  deferredWorkspace = null
  const workspacePath = sessionIndex?.upsertWorkspace(cwd) ?? cwd

  state = null

  const requestId = createRequestId()
  const response = await requireSidecar().request<
    Extract<SidecarMessage, { type: 'session_ready' }>
  >({
    type: 'start_session',
    requestId,
    cwd: workspacePath,
    workspaceTrusted: sessionIndex?.isWorkspaceTrusted(workspacePath) ?? false,
    sessionFile: options.sessionFile,
  })

  const payload = response.payload
  state = {
    cwd: payload.cwd,
    sessionFile: payload.sessionFile,
    sessionId: payload.sessionId,
  }

  mainWindow?.webContents.send('session-ready', payload)

  // Refresh sessions for this workspace
  if (workspacePath) {
    sessionIndex?.refreshSessions(workspacePath)
    mainWindow?.webContents.send('session-index-updated')
  }
}

async function ensureActiveSession(): Promise<SessionState | null> {
  if (state) return state
  if (!deferredWorkspace) return null
  await startSession(deferredWorkspace)
  return state
}

function activeWorkspacePath(): string | null {
  return state?.cwd ?? deferredWorkspace ?? null
}

// ─── Window ────────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const saved = readWindowState()

  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width ?? 1200,
    height: saved.height ?? 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  })

  if (saved.isMaximized) win.maximize()
  if (saved.isFullScreen) win.setFullScreen(true)

  win.once('ready-to-show', () => {
    win.show()
    if (process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools()
    }
  })

  win.on('close', () => {
    const bounds = win.getBounds()
    writeWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
    })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

async function loadURL(win: BrowserWindow): Promise<void> {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await win.loadFile(path.join(currentDir, '../renderer/index.html'))
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  mainWindow = createWindow()
  void loadURL(mainWindow)

  // Initialize session index
  const dbPath = path.join(app.getPath('userData'), 'pi-desktop.sqlite')
  sessionIndex = new SessionIndexStore(dbPath)

  // Seed workspaces from existing Pi sessions
  try {
    sessionIndex.refreshSessions()
  } catch {
    // non-fatal on first run
  }

  registerIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      void loadURL(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  sessionIndex?.close()
  piSidecarHost?.stop()
})

// ─── IPC handlers ──────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // ── App info ──────────────────────────────────────────────────────────
  ipcMain.handle('get-app-info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
  }))

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // ── Workspaces ─────────────────────────────────────────────────────────
  ipcMain.handle('get-workspaces', async () => {
    return sessionIndex?.listWorkspaces() ?? []
  })

  ipcMain.handle('get-sessions', async (_event, workspacePath: string) => {
    return sessionIndex?.listSessions(workspacePath) ?? []
  })

  ipcMain.handle('add-workspace', async () => {
    if (!mainWindow) return { cancelled: true }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add Workspace',
      properties: ['openDirectory'],
      buttonLabel: 'Add Workspace',
    })
    if (result.canceled || !result.filePaths[0]) {
      return { cancelled: true }
    }
    const workspacePath = result.filePaths[0]
    try {
      sessionIndex?.upsertWorkspace(workspacePath)
      sessionIndex?.refreshSessions(workspacePath)
      mainWindow?.webContents.send('session-index-updated')
    } catch (err) {
      console.error('Failed to add workspace:', err)
      return { cancelled: true }
    }
    return { cancelled: false, path: workspacePath }
  })

  ipcMain.handle('remove-workspace', async (_event, workspacePath: string) => {
    sessionIndex?.removeWorkspace(workspacePath)
    mainWindow?.webContents.send('session-index-updated')
  })

  // ── Session management ─────────────────────────────────────────────────
  ipcMain.handle('open-session', async (_event, sessionPath: string) => {
    const workspacePath = sessionIndex?.getSessionWorkspace(sessionPath) ?? state?.cwd
    if (!workspacePath) return
    await startSession(workspacePath, { sessionFile: sessionPath })
  })

  ipcMain.handle('new-session', async (_event, cwd?: string) => {
    const workspacePath = cwd ?? state?.cwd ?? sessionIndex?.getLastWorkspace()
    if (!workspacePath) return
    await startSession(workspacePath)
  })

  ipcMain.handle('get-session-messages', async (_event, sessionPath: string) => {
    return await readSessionMessages(sessionPath)
  })

  // ── Chat / Agent ───────────────────────────────────────────────────────
  ipcMain.handle('send-prompt', async (_event, text: string, contextPrefix?: string) => {
    const active = await ensureActiveSession()
    if (!active) return
    requireSidecar().send({ type: 'prompt', text, contextPrefix })
  })

  ipcMain.handle('send-steer', async (_event, text: string, contextPrefix?: string) => {
    const active = await ensureActiveSession()
    if (!active) return
    requireSidecar().send({ type: 'steer', text, contextPrefix })
  })

  ipcMain.handle('send-follow-up', async (_event, text: string, contextPrefix?: string) => {
    const active = await ensureActiveSession()
    if (!active) return
    requireSidecar().send({ type: 'follow_up', text, contextPrefix })
  })

  ipcMain.handle('abort-session', async () => {
    if (!state) return
    requireSidecar().send({ type: 'abort' })
  })

  ipcMain.handle('get-models', async () => {
    const requestId = createRequestId()
    const response = await requireSidecar().request<
      Extract<SidecarMessage, { type: 'models_result' }>
    >({ type: 'get_models', requestId })
    return response.models
  })

  ipcMain.handle('set-model', async (_event, provider: string, modelId: string) => {
    if (!state) return
    requireSidecar().send({ type: 'set_model', provider, modelId })
  })

  ipcMain.handle('set-thinking', async (_event, level: string) => {
    if (!state) return
    requireSidecar().send({ type: 'set_thinking', level })
  })

  ipcMain.handle('get-session-stats', async () => {
    const requestId = createRequestId()
    const response = await requireSidecar().request<
      Extract<SidecarMessage, { type: 'stats_result' }>
    >({ type: 'get_stats', requestId })
    return response.stats
  })
}
