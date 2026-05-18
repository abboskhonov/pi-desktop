import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'

// ─── Types ─────────────────────────────────────────────────────────────────

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
  | { type: 'execute_bash'; requestId: string; command: string; excludeFromContext?: boolean }
  | { type: 'set_session_name'; name: string }
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

// ─── State ───────────────────────────────────────────────────────────────────

type SessionState = {
  session: Awaited<ReturnType<typeof createAgentSession>>['session']
  cwd: string
  unsubscribe: () => void
}

let state: SessionState | null = null
let _authStorage: ReturnType<typeof AuthStorage.create> | null = null
let _modelRegistry: ReturnType<typeof ModelRegistry.create> | null = null
let _cachedResourceLoader: {
  cwd: string
  workspaceTrusted: boolean
  loader: InstanceType<typeof DefaultResourceLoader>
} | null = null

// ─── Port ────────────────────────────────────────────────────────────────────

type ParentPort = {
  postMessage(msg: unknown): void
  on(event: 'message', listener: (message: unknown) => void): void
}

function createParentPort(): ParentPort | null {
  const electronParentPort = (process as unknown as { parentPort?: ParentPort }).parentPort
  if (electronParentPort) return electronParentPort

  if (typeof process.send !== 'function') return null
  return {
    postMessage(msg: unknown): void {
      process.send?.(msg)
    },
    on(_event: 'message', listener: (message: unknown) => void): void {
      process.on('message', listener)
    },
  }
}

const maybeParentPort = createParentPort()
if (!maybeParentPort) {
  process.stderr.write('[piSidecar] No parent port — must run as utilityProcess or Node fork\n')
  process.exit(1)
}
const parentPort: ParentPort = maybeParentPort

function send(msg: SidecarMessage): void {
  parentPort.postMessage(msg)
}

function getAgentDir(): string {
  return path.join(os.homedir(), '.pi', 'agent')
}

function getAuthStorage() {
  const agentDir = getAgentDir()
  _authStorage ??= AuthStorage.create(path.join(agentDir, 'auth.json'))
  return _authStorage
}

function getModelRegistry() {
  _modelRegistry ??= ModelRegistry.create(getAuthStorage(), path.join(getAgentDir(), 'models.json'))
  return _modelRegistry
}

function invalidateModelRegistry(): void {
  _modelRegistry = null
}

function outputLine(level: 'info' | 'warn' | 'error', text: string): void {
  send({ type: 'output_append', line: { level, text, ts: Date.now() } })
}

// ─── Resource loader ─────────────────────────────────────────────────────────

async function getResourceLoader(cwd: string, workspaceTrusted: boolean) {
  const agentDir = getAgentDir()
  if (
    _cachedResourceLoader &&
    _cachedResourceLoader.cwd === cwd &&
    _cachedResourceLoader.workspaceTrusted === workspaceTrusted
  ) {
    return _cachedResourceLoader.loader
  }

  const fileSettingsManager = SettingsManager.create(cwd, agentDir)
  const settingsManager = workspaceTrusted
    ? fileSettingsManager
    : SettingsManager.inMemory(fileSettingsManager.getGlobalSettings())

  const noExtensions = !workspaceTrusted
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions,
    additionalExtensionPaths: noExtensions ? [agentDir] : [],
  })
  try {
    await loader.reload()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    outputLine('warn', `[packages] One or more Pi packages failed: ${msg}`)
  }
  _cachedResourceLoader = { cwd, workspaceTrusted, loader }
  return loader
}

// ─── Session management ────────────────────────────────────────────────────

async function startSession(
  cwd: string,
  opts: {
    sessionFile?: string
    requestId?: string
    workspaceTrusted?: boolean
  } = {}
): Promise<void> {
  // Dispose previous session
  if (state) {
    state.unsubscribe()
    state.session.dispose()
    state = null
  }

  const agentDir = getAgentDir()
  const authStorage = getAuthStorage()
  const modelRegistry = getModelRegistry()
  const fileSettingsManager = SettingsManager.create(cwd, agentDir)
  const workspaceTrusted = opts.workspaceTrusted ?? false
  const settingsManager = workspaceTrusted
    ? fileSettingsManager
    : SettingsManager.inMemory(fileSettingsManager.getGlobalSettings())

  let sessionManager = opts.sessionFile
    ? SessionManager.open(opts.sessionFile, undefined, cwd)
    : SessionManager.create(cwd)

  const resourceLoader = await getResourceLoader(cwd, workspaceTrusted)

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    sessionManager,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
  })

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    send({ type: 'session_event', event: event as Record<string, unknown> })

    const ev = event as {
      type: string
      success?: boolean
      finalError?: string
      errorMessage?: string
      message?: string
    }

    if (ev.type === 'agent_end') {
      send({ type: 'session_index_updated' })
    }
    if (ev.type === 'extension_error') {
      outputLine('error', `[extension] ${String(ev.message ?? 'error')}`)
    }
    if (ev.type === 'auto_retry_end' && ev.success === false) {
      outputLine('warn', `[retry] ${ev.finalError ?? 'Auto-retry failed'}`)
    }
    if (ev.type === 'compaction_end' && ev.errorMessage) {
      outputLine('error', `[compaction] ${ev.errorMessage}`)
    }
  })

  state = { session, cwd, unsubscribe }

  const model = session.model as
    | { id: string; name: string; provider: string; reasoning?: boolean; contextWindow?: number }
    | undefined

  const payload: SessionReadyPayload = {
    cwd,
    sessionFile: session.sessionFile ?? null,
    sessionId: session.sessionId ?? null,
    sessionName: opts.sessionFile ? null : null,
    model: model
      ? {
          id: model.id,
          name: model.name,
          provider: model.provider,
          reasoning: model.reasoning ?? false,
          contextWindow: model.contextWindow ?? 0,
        }
      : null,
    thinkingLevel: (session.thinkingLevel as string | undefined) ?? null,
  }

  send({ type: 'session_ready', requestId: opts.requestId, payload })
}

// ─── Command handler ─────────────────────────────────────────────────────────

parentPort.on('message', (message) => {
  const cmd = (
    message && typeof message === 'object' && 'data' in message
      ? (message as { data: unknown }).data
      : message
  ) as SidecarCommand
  void handleCommand(cmd).catch((err) => {
    send({
      type: 'error',
      requestId: cmd && typeof cmd === 'object' && 'requestId' in cmd ? cmd.requestId : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
  })
})

async function handleCommand(cmd: SidecarCommand): Promise<void> {
  switch (cmd.type) {
    case 'start_session': {
      try {
        await startSession(cmd.cwd, {
          sessionFile: cmd.sessionFile,
          requestId: cmd.requestId,
          workspaceTrusted: cmd.workspaceTrusted,
        })
      } catch (err) {
        send({
          type: 'session_error',
          requestId: cmd.requestId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    case 'prompt': {
      if (!state) return
      await state.session.prompt(cmd.text)
      break
    }

    case 'steer': {
      if (!state) return
      await state.session.steer(cmd.text)
      break
    }

    case 'follow_up': {
      if (!state) return
      await state.session.followUp(cmd.text)
      break
    }

    case 'abort': {
      if (!state) return
      await state.session.abort()
      break
    }

    case 'execute_bash': {
      if (!state) {
        send({ type: 'bash_result', requestId: cmd.requestId, result: null })
        return
      }
      const result = await state.session.executeBash(cmd.command, undefined, {
        excludeFromContext: cmd.excludeFromContext,
      })
      send({ type: 'bash_result', requestId: cmd.requestId, result })
      break
    }

    case 'set_model': {
      if (!state) return
      const model = getModelRegistry().find(cmd.provider, cmd.modelId)
      if (!model) return
      await state.session.setModel(model)
      break
    }

    case 'set_thinking': {
      if (!state) return
      state.session.setThinkingLevel(
        cmd.level as Parameters<typeof state.session.setThinkingLevel>[0]
      )
      break
    }

    case 'set_session_name': {
      if (!state) return
      state.session.setSessionName(cmd.name)
      break
    }

    case 'get_stats': {
      if (!state) {
        send({
          type: 'stats_result',
          requestId: cmd.requestId,
          stats: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cost: 0,
            contextUsagePercent: null,
            sessionFile: null,
            sessionId: null,
            isStreaming: false,
          },
        })
        return
      }
      const agent = state.session.agent
      type AssistantMsg = {
        role: string
        usage?: {
          input?: number
          output?: number
          cacheRead?: number
          cacheWrite?: number
          cost?: { total?: number } | number
        }
      }
      const msgs: AssistantMsg[] =
        (agent as unknown as { state?: { messages?: AssistantMsg[] } }).state?.messages ?? []
      let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, cost = 0
      for (const m of msgs) {
        if (m.role !== 'assistant') continue
        inputTokens += m.usage?.input ?? 0
        outputTokens += m.usage?.output ?? 0
        cacheReadTokens += m.usage?.cacheRead ?? 0
        cacheWriteTokens += m.usage?.cacheWrite ?? 0
        const usageCost = m.usage?.cost
        cost += typeof usageCost === 'number' ? usageCost : (usageCost as { total?: number } | undefined)?.total ?? 0
      }
      send({
        type: 'stats_result',
        requestId: cmd.requestId,
        stats: {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          cost,
          contextUsagePercent: state.session.getContextUsage()?.percent ?? null,
          sessionFile: state.session.sessionFile ?? null,
          sessionId: state.session.sessionId ?? null,
          isStreaming:
            (agent as unknown as { state?: { isStreaming?: boolean } }).state?.isStreaming ?? false,
        },
      })
      break
    }

    case 'get_models': {
      const models = await getModelRegistry().getAvailable()
      const mapped = (
        models as Array<{
          id: string
          name: string
          provider: string
          reasoning?: boolean
          contextWindow?: number
        }>
      ).map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        reasoning: m.reasoning ?? false,
        contextWindow: m.contextWindow ?? 0,
      }))
      send({ type: 'models_result', requestId: cmd.requestId, models: mapped })
      break
    }

    case 'stop': {
      if (state) {
        state.unsubscribe()
        state.session.dispose()
        state = null
      }
      send({ type: 'stopped' })
      setTimeout(() => process.exit(0), 100)
      break
    }
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

send({ type: 'ready' })
