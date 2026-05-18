import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

function getAsarUnpackedPath(filePath: string) {
  return filePath.includes('.asar') ? filePath.replace('.asar', '.asar.unpacked') : null
}

function resolveSidecarPath(): string {
  // Dev: use the sibling .mjs next to the main bundle
  const devPath = path.join(currentDir, 'piSidecar.mjs')
  if (!app.isPackaged && require('node:fs').existsSync(devPath)) {
    return devPath
  }

  // Production: the file is inside app.asar but asarUnpack extracts it
  // to app.asar.unpacked. We need the real disk path so Node.js spawn
  // can execute it.
  const prodPath = path.join(app.getAppPath(), 'out', 'main', 'piSidecar.mjs')
  const unpacked = getAsarUnpackedPath(prodPath)
  if (unpacked && require('node:fs').existsSync(unpacked)) {
    return unpacked
  }
  if (require('node:fs').existsSync(prodPath)) {
    return prodPath
  }

  // Fallback (shouldn't happen)
  return devPath
}

const SIDECAR_PATH = resolveSidecarPath()
const RESTART_DELAY_MS = 1500
const MAX_RESTARTS = 3

export type SidecarCommand =
  | { type: 'start_session'; cwd: string; sessionFile?: string; requestId?: string; workspaceTrusted?: boolean }
  | { type: 'prompt'; text: string; contextPrefix?: string; images?: Array<{ data: string; mimeType: string }> }
  | { type: 'steer'; text: string; contextPrefix?: string; images?: Array<{ data: string; mimeType: string }> }
  | { type: 'follow_up'; text: string; contextPrefix?: string; images?: Array<{ data: string; mimeType: string }> }
  | { type: 'abort' }
  | { type: 'set_model'; provider: string; modelId: string }
  | { type: 'set_thinking'; level: string }
  | { type: 'get_stats'; requestId: string }
  | { type: 'get_models'; requestId: string }
  | { type: 'stop' }

export type SidecarMessage =
  | { type: 'ready' }
  | { type: 'session_ready'; requestId?: string; payload: SessionReadyPayload }
  | { type: 'session_event'; event: Record<string, unknown> }
  | { type: 'session_error'; requestId?: string; message: string; code?: string }
  | { type: 'stats_result'; requestId: string; stats: Record<string, unknown> }
  | { type: 'models_result'; requestId: string; models: unknown[] }
  | { type: 'bash_result'; requestId: string; result: unknown }
  | { type: 'output_append'; line: { level: string; text: string; ts: number } }
  | { type: 'error'; requestId?: string; message: string }
  | { type: 'stopped' }
  | { type: 'session_index_updated' }

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

interface PendingRequest {
  resolve: (msg: SidecarMessage) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}

export class PiSidecarHost {
  private child: ChildProcess | null = null
  private readonly onMessage: (msg: SidecarMessage) => void
  private readonly onCrash: () => void
  private readonly onReady: () => void
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private restartCount = 0
  private stopping = false
  private _stdoutBuf = ''
  private _stderrBuf = ''
  private _readyPromise: Promise<void> | null = null
  private _readyResolve: (() => void) | null = null

  constructor(opts: { onMessage: (msg: SidecarMessage) => void; onCrash: () => void; onReady?: () => void }) {
    this.onMessage = opts.onMessage
    this.onCrash = opts.onCrash
    this.onReady = opts.onReady ?? (() => {})
  }

  start(): void {
    this.stopping = false
    this.restartCount = 0
    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve
    })
    this.spawnChild()
  }

  ready(): Promise<void> {
    return this._readyPromise ?? Promise.resolve()
  }

  private spawnChild(): void {
    console.log('[sidecar-host] spawning sidecar at', SIDECAR_PATH)

    const child = spawn('node', [SIDECAR_PATH], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: process.env,
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      this._stdoutBuf += chunk.toString('utf8')
      const parts = this._stdoutBuf.split('\n')
      this._stdoutBuf = parts.pop() ?? ''
      for (const line of parts) {
        if (!line.trim()) continue
        this.onMessage({
          type: 'output_append',
          line: { level: 'info', text: `[sidecar] ${line}`, ts: Date.now() },
        })
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      this._stderrBuf += chunk.toString('utf8')
      const parts = this._stderrBuf.split('\n')
      this._stderrBuf = parts.pop() ?? ''
      for (const line of parts) {
        if (!line.trim()) continue
        this.onMessage({
          type: 'output_append',
          line: { level: 'error', text: `[sidecar] ${line}`, ts: Date.now() },
        })
      }
    })

    child.on('message', (msg: unknown) => {
      const message = msg as SidecarMessage
      if (message.type === 'ready') {
        if (this._readyResolve) {
          this._readyResolve()
          this._readyResolve = null
        }
        this.onReady()
      }
      const requestId = 'requestId' in message ? message.requestId : undefined
      if (requestId) {
        const pending = this.pendingRequests.get(requestId)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(requestId)
          if (message.type === 'error' || message.type === 'session_error') {
            pending.reject(new Error(message.message))
          } else {
            pending.resolve(message)
          }
          return
        }
      }
      this.onMessage(message)
    })

    // Capture the child reference so the exit handler only acts for THIS child.
    const childRef = child
    child.on('exit', (code) => {
      // If a new child already replaced this one, ignore.
      if (this.child !== childRef) {
        return
      }

      this.child = null
      for (const pending of this.pendingRequests.values()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error(`Pi sidecar exited with code ${code}`))
      }
      this.pendingRequests.clear()

      for (const [buf, level] of [
        [this._stdoutBuf, 'info' as const],
        [this._stderrBuf, 'error' as const],
      ] as const) {
        if (buf.trim()) {
          this.onMessage({
            type: 'output_append',
            line: { level, text: `[sidecar] ${buf}`, ts: Date.now() },
          })
        }
      }
      this._stdoutBuf = ''
      this._stderrBuf = ''

      if (this.stopping) return
      if (this.restartCount < MAX_RESTARTS) {
        this.restartCount++
        setTimeout(() => {
          if (!this.stopping) this.spawnChild()
        }, RESTART_DELAY_MS)
      } else {
        this.onCrash()
      }
    })

    this.child = child
  }

  send(command: SidecarCommand): void {
    this.child?.send?.(command)
  }

  request<T extends SidecarMessage>(
    command: SidecarCommand & { requestId: string },
    timeoutMs = 60_000
  ): Promise<T> {
    if (!this.child) return Promise.reject(new Error('Pi sidecar is not running'))

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(command.requestId)
        reject(new Error(`Pi sidecar request timed out: ${command.type}`))
      }, timeoutMs)

      this.pendingRequests.set(command.requestId, {
        resolve: (msg) => resolve(msg as T),
        reject,
        timeout,
      })
      this.child!.send!(command)
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    // Force-null the child reference so any requests during the restart
    // window fail cleanly with "not running" instead of hitting a dying process.
    this.child = null
    this.stopping = false
    this.restartCount = 0
    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve
    })
    this.spawnChild()
    await this.ready()
  }

  stop(): Promise<void> {
    this.stopping = true
    if (!this.child) return Promise.resolve()

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.child?.kill()
        resolve()
      }, 4000)

      const cleanup = (msg: unknown) => {
        if ((msg as SidecarMessage).type === 'stopped') {
          clearTimeout(timeout)
          resolve()
        }
      }

      this.child.on('message', cleanup)
      this.child.send({ type: 'stop' })
    })
  }
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export { createRequestId }
