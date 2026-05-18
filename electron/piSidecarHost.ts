import { type ChildProcess, fork, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, type UtilityProcess, utilityProcess } from 'electron'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const SIDECAR_PATH = path.join(currentDir, 'piSidecar.js')
const SIDECAR_SERVICE_NAME = 'pi-desktop-sidecar'
const RESTART_DELAY_MS = 1500
const MAX_RESTARTS = 3

export type SidecarCommand =
  | { type: 'start_session'; cwd: string; sessionFile?: string; requestId?: string; workspaceTrusted?: boolean }
  | { type: 'prompt'; text: string; contextPrefix?: string }
  | { type: 'steer'; text: string; contextPrefix?: string }
  | { type: 'follow_up'; text: string; contextPrefix?: string }
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

type SidecarProcess = UtilityProcess | ChildProcess

interface PendingRequest {
  resolve: (msg: SidecarMessage) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}

function isUtilityProcess(child: SidecarProcess): child is UtilityProcess {
  return 'postMessage' in child
}

function findNodeExecutable(): string | null {
  if (app.isPackaged) return null
  const candidates = [process.env.OPENPI_NODE_EXECUTABLE, 'node'].filter((c): c is string => Boolean(c))
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-e', 'process.exit(process.versions.electron ? 1 : 0)'], {
      encoding: 'utf-8',
      timeout: 3000,
    })
    if (result.status === 0) return candidate
  }
  return null
}

function sendToSidecar(child: SidecarProcess, command: SidecarCommand): void {
  if (isUtilityProcess(child)) {
    child.postMessage(command)
    return
  }
  child.send(command)
}

export class PiSidecarHost {
  private child: SidecarProcess | null = null
  private readonly onMessage: (msg: SidecarMessage) => void
  private readonly onCrash: () => void
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private restartCount = 0
  private stopping = false
  private _stdoutBuf = ''
  private _stderrBuf = ''

  constructor(opts: { onMessage: (msg: SidecarMessage) => void; onCrash: () => void }) {
    this.onMessage = opts.onMessage
    this.onCrash = opts.onCrash
  }

  start(): void {
    this.stopping = false
    this.restartCount = 0
    this.spawnChild()
  }

  private spawnChild(): void {
    const nodeExecutable = findNodeExecutable()
    const child: SidecarProcess = nodeExecutable
      ? fork(SIDECAR_PATH, [], {
          execPath: nodeExecutable,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        })
      : utilityProcess.fork(SIDECAR_PATH, [], {
          serviceName: SIDECAR_SERVICE_NAME,
          stdio: 'pipe',
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

    ;(child as unknown as { on(event: 'exit', listener: (code: number | null) => void): void }).on(
      'exit',
      (code) => {
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
      }
    )

    this.child = child
  }

  send(command: SidecarCommand): void {
    if (this.child) sendToSidecar(this.child, command)
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
      sendToSidecar(this.child!, command)
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    this.stopping = false
    this.restartCount = 0
    this.spawnChild()
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

      this.child!.on('message', cleanup)
      sendToSidecar(this.child!, { type: 'stop' })
    })
  }
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export { createRequestId }
