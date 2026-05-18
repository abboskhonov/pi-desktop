import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn, execSync } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readWindowState, writeWindowState } from './window-state'
import { SessionIndexStore } from './sessionIndex'
import { readSessionMessages } from './sessionMessages'
import { PiSidecarHost, createRequestId } from './piSidecarHost'
import type { SidecarMessage, SessionReadyPayload } from './piSidecarHost'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

// ── Linux GPU fixes ─────────────────────────────────────────────────────────
// Only disable hardware acceleration when explicitly requested.
// Software rendering makes the UI feel sluggish on most modern Linux GPUs.
if (process.platform === 'linux' && process.env.PI_DISABLE_GPU) {
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
          _sessionFile: state?.sessionFile ?? null,
          _sessionId: state?.sessionId ?? null,
        })
      },
      onReady: () => {
        mainWindow?.webContents.send('sidecar-ready')
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
      // Tag events with the active session so the renderer can route them
      // to the correct session's state (fixes stop-button bleed when switching chats).
      mainWindow?.webContents.send('session-event', {
        ...msg.event,
        _sessionFile: state?.sessionFile ?? null,
        _sessionId: state?.sessionId ?? null,
      })
      return
    }

    case 'session_error':
      // Tag errors with the active session so the renderer routes them
      // to the correct session's state (fixes stuck-thinking on crashed sessions).
      mainWindow?.webContents.send('session-error', {
        message: msg.message,
        ...(msg.code ? { code: msg.code } : {}),
        _sessionFile: state?.sessionFile ?? null,
        _sessionId: state?.sessionId ?? null,
      })
      return

    case 'output_append':
      return

    case 'session_index_updated': {
      sessionIndex?.refreshSessions(state?.cwd)
      mainWindow?.webContents.send('session-index-updated')
      return
    }

    case 'bash_result':
      // bash results are handled via session events for UI display
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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: process.platform === 'darwin',
    icon: path.join(currentDir, '../../build/icon.png'),
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

  win.on('maximize', () => {
    win.webContents.send('window-maximized', true)
  })

  win.on('unmaximize', () => {
    win.webContents.send('window-maximized', false)
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
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
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

  // ── Window controls ────────────────────────────────────────────────────
  ipcMain.handle('window-minimize', async () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window-maximize', async () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window-close', async () => {
    mainWindow?.close()
  })

  ipcMain.handle('window-is-maximized', async () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('restart-sidecar', async () => {
    await piSidecarHost?.restart()
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

  ipcMain.handle('rename-session', async (_event, sessionPath: string, newTitle: string) => {
    sessionIndex?.renameSession(sessionPath, newTitle)
    mainWindow?.webContents.send('session-index-updated')
  })

  ipcMain.handle('delete-session', async (_event, sessionPath: string) => {
    sessionIndex?.deleteSession(sessionPath)
    mainWindow?.webContents.send('session-index-updated')
  })

  ipcMain.handle('pin-session', async (_event, sessionPath: string, pinned: boolean) => {
    sessionIndex?.pinSession(sessionPath, pinned)
    mainWindow?.webContents.send('session-index-updated')
  })

  // ── Chat / Agent ───────────────────────────────────────────────────────
  ipcMain.handle('send-prompt', async (_event, text: string, contextPrefix?: string, images?: Array<{ data: string; mimeType: string }>) => {
    const active = await ensureActiveSession()
    if (!active) throw new Error('No active session. Open or create a session first.')
    requireSidecar().send({ type: 'prompt', text, contextPrefix, images })
  })

  ipcMain.handle('send-steer', async (_event, text: string, contextPrefix?: string, images?: Array<{ data: string; mimeType: string }>) => {
    const active = await ensureActiveSession()
    if (!active) throw new Error('No active session. Open or create a session first.')
    requireSidecar().send({ type: 'steer', text, contextPrefix, images })
  })

  ipcMain.handle('send-follow-up', async (_event, text: string, contextPrefix?: string, images?: Array<{ data: string; mimeType: string }>) => {
    const active = await ensureActiveSession()
    if (!active) throw new Error('No active session. Open or create a session first.')
    requireSidecar().send({ type: 'follow_up', text, contextPrefix, images })
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
    const models = response.models as Array<{ id: string; name: string; provider: string }>
    console.log('[main] get-models returned', models.length, 'models:', models.map((m) => `${m.provider}/${m.name}`))
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

  // ── Skills ───────────────────────────────────────────────────────────
  ipcMain.handle('get-installed-skills', async () => {
    const home = homedir()
    const agentsSkills = scanSkillsDir(path.join(home, '.agents', 'skills'))
    const piSkills = scanSkillsDir(path.join(home, '.pi', 'agent', 'skills'))
    return [...agentsSkills, ...piSkills]
  })

  ipcMain.handle('search-skills', async (_event, query: string) => {
    const q = encodeURIComponent(query)
    const res = await fetch(`https://skills.sh/api/search?q=${q}&limit=24`)
    if (!res.ok) throw new Error(`skills.sh returned ${res.status}`)
    return await res.json()
  })

  ipcMain.handle('install-skill', async (_event, spec: string, global: boolean, cwd?: string) => {
    const args = ['skills', 'add', spec, '-y']
    if (global) args.push('-g')
    return new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
      const proc = spawn('npx', args, { cwd, env: process.env, shell: true })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (d) => { stdout += String(d) })
      proc.stderr.on('data', (d) => { stderr += String(d) })
      proc.on('error', (err) => {
        resolve({ success: false, stdout, stderr: err.message })
      })
      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr })
      })
    })
  })

  // ── Extensions ─────────────────────────────────────────────────────────
  ipcMain.handle('search-extensions', async (_event, query: string) => {
    const q = encodeURIComponent(query || 'pi-extension')
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${q}&size=250`)
    if (!res.ok) throw new Error(`npm registry returned ${res.status}`)
    const data = await res.json()
    return {
      packages: data.objects?.map((obj: any) => ({
        name: obj.package.name,
        description: obj.package.description,
        version: obj.package.version,
        keywords: obj.package.keywords,
      })) ?? []
    }
  })

  ipcMain.handle('get-installed-extensions', async () => {
    return scanPiExtensions()
  })

  ipcMain.handle('install-extension', async (_event, packageName: string) => {
    const result = await new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
      const proc = spawn('pi', ['install', `npm:${packageName}`], { env: process.env, shell: true })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (d) => { stdout += String(d) })
      proc.stderr.on('data', (d) => { stderr += String(d) })
      proc.on('error', (err) => {
        resolve({ success: false, stdout, stderr: err.message })
      })
      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr })
      })
    })

    if (result.success) {
      // Just notify the renderer to bust its cache and re-fetch.
      // DON'T restart the sidecar — the running process already has the
      // extension loaded in its session context. Restarting kills that state
      // and the new process may not re-discover the extension in time.
      console.log('[main] extension installed, telling renderer to refresh models')
      mainWindow?.webContents.send('sidecar-ready')
    }

    return result
  })
}

// ─── Extension scanning helpers ────────────────────────────────────────────

interface PiExtension {
  name: string
  version: string
  description?: string
  installedAt?: string
}

function scanPiExtensions(): PiExtension[] {
  const extensions: PiExtension[] = []
  const home = homedir()

  // Scan ~/.pi/extensions/ if it exists
  const piExtDir = path.join(home, '.pi', 'extensions')
  try {
    const entries = readdirSync(piExtDir)
    for (const entry of entries) {
      const entryPath = path.join(piExtDir, entry)
      const stat = statSync(entryPath)
      if (stat.isDirectory()) {
        try {
          const pkgJson = JSON.parse(readFileSync(path.join(entryPath, 'package.json'), 'utf-8'))
          extensions.push({
            name: pkgJson.name ?? entry,
            version: pkgJson.version ?? 'unknown',
            description: pkgJson.description,
            installedAt: stat.mtime.toISOString(),
          })
        } catch {
          extensions.push({ name: entry, version: 'unknown' })
        }
      }
    }
  } catch {
    // Directory doesn't exist — try other methods
  }

  // Scan ~/.pi/node_modules/ for pi-extension keyword packages
  const piNodeModules = path.join(home, '.pi', 'node_modules')
  try {
    const entries = readdirSync(piNodeModules)
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const entryPath = path.join(piNodeModules, entry)
      const stat = statSync(entryPath)
      if (stat.isDirectory()) {
        try {
          const pkgJson = JSON.parse(readFileSync(path.join(entryPath, 'package.json'), 'utf-8'))
          const keywords = pkgJson.keywords ?? []
          if (keywords.includes('pi-extension')) {
            // Skip duplicates
            if (!extensions.find((e) => e.name === pkgJson.name)) {
              extensions.push({
                name: pkgJson.name ?? entry,
                version: pkgJson.version ?? 'unknown',
                description: pkgJson.description,
                installedAt: stat.mtime.toISOString(),
              })
            }
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Try `pi list` command if available
  try {
    const result = execSync('pi list --json', { encoding: 'utf-8', timeout: 5000, env: process.env })
    const list = JSON.parse(result)
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item.name === 'string' && !extensions.find((e) => e.name === item.name)) {
          extensions.push({
            name: item.name,
            version: item.version ?? 'unknown',
            description: item.description,
          })
        }
      }
    }
  } catch {
    // pi list not available or failed
  }

  return extensions
}

// ─── Skill scanning helpers ────────────────────────────────────────────────

function parseSkillMd(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { name: '', description: '' }
  const frontmatter = match[1]
  const nameMatch = frontmatter.match(/name:\s*(.*)/)
  const descMatch = frontmatter.match(/description:\s*(.*)/)
  return {
    name: nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
  }
}

function scanSkillsDir(dir: string): Array<{ name: string; description: string; path: string; source: string }> {
  const skills: Array<{ name: string; description: string; path: string; source: string }> = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const entryPath = path.join(dir, entry)
      const stat = statSync(entryPath)
      if (stat.isDirectory()) {
        const skillMdPath = path.join(entryPath, 'SKILL.md')
        try {
          const content = readFileSync(skillMdPath, 'utf-8')
          const { name, description } = parseSkillMd(content)
          skills.push({
            name: name || entry,
            description,
            path: entryPath,
            source: 'local',
          })
        } catch {
          // No SKILL.md — skip
        }
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }
  return skills
}
