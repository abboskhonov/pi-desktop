import fs from 'node:fs'
import { createInterface } from 'node:readline'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp?: number
  thinking?: string
  modelName?: string
  toolCards?: ToolCard[]
}

export interface ToolCard {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  output?: string
  isError?: boolean
}

export interface SessionMessagesResult {
  messages: ChatMessage[]
  sessionName: string | null
}

export async function readSessionMessages(sessionPath: string): Promise<SessionMessagesResult> {
  const messages: ChatMessage[] = []
  let sessionName: string | null = null
  let currentModelName: string | null = null
  const pendingToolCards = new Map<string, ToolCard>()

  try {
    const fileStream = fs.createReadStream(sessionPath, { encoding: 'utf8' })
    const rl = createInterface({ input: fileStream, crlfDelay: Number.POSITIVE_INFINITY })

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        if (typeof entry.type !== 'string') continue

        switch (entry.type) {
          case 'model_change': {
            const modelId = (entry.modelId as string) || ''
            if (modelId) currentModelName = modelId
            break
          }

          case 'session_info': {
            const name = entry.name
            if (typeof name === 'string' && name.trim()) {
              sessionName = name.trim()
            }
            break
          }

          case 'message': {
            const msg = entry.message as Record<string, unknown>
            const role = msg?.role as string
            const timestamp = numeric(msg?.timestamp)
            const id = (entry.id as string) || ''

            if (role === 'user') {
              messages.push({
                id: id || `u-${timestamp}`,
                role: 'user',
                text: contentToText(msg.content),
                timestamp,
              })
            } else if (role === 'assistant') {
              const assistantMsg: ChatMessage = {
                id: id || `a-${timestamp}`,
                role: 'assistant',
                text: assistantText(msg.content),
                timestamp,
                modelName: currentModelName || undefined,
                thinking: assistantThinking(msg.content) || undefined,
                toolCards: toolCallsFromContent(msg.content),
              }

              // Attach pending tool results
              if (assistantMsg.toolCards) {
                for (const card of assistantMsg.toolCards) {
                  const pending = pendingToolCards.get(card.toolCallId)
                  if (pending) {
                    card.output = pending.output
                    card.isError = pending.isError
                    pendingToolCards.delete(card.toolCallId)
                  }
                }
              }

              messages.push(assistantMsg)
            } else if (role === 'toolResult') {
              const toolCallId = (msg.toolCallId as string) || ''
              const toolName = (msg.toolName as string) || 'tool'
              const output = contentToText(msg.content)
              const isError = Boolean(msg.isError)

              // Try to attach to existing assistant message
              let attached = false
              for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i]
                if (m.role !== 'assistant' || !m.toolCards) continue
                const card = m.toolCards.find((c) => c.toolCallId === toolCallId)
                if (card) {
                  card.output = output
                  card.isError = isError
                  attached = true
                  break
                }
              }

              if (!attached && toolCallId) {
                pendingToolCards.set(toolCallId, {
                  toolCallId,
                  toolName,
                  args: {},
                  output,
                  isError,
                })
              }
            } else if (role === 'bashExecution') {
              const command = (msg.command as string) || ''
              const output = (msg.output as string) || ''
              const exitCode = numeric(msg.exitCode)
              messages.push({
                id: id || `bash-${timestamp}`,
                role: 'assistant',
                text: '',
                timestamp,
                toolCards: [
                  {
                    toolCallId: id || `bash-${timestamp}`,
                    toolName: 'bash',
                    args: { command },
                    output,
                    isError: exitCode !== 0,
                  },
                ],
              })
            }
            break
          }
        }
      } catch {
        // skip malformed line
      }
    }

    rl.close()
    fileStream.destroy()
  } catch {
    // file read error
  }

  return { messages, sessionName }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

function assistantText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (part && typeof part === 'object' && 'type' in part) {
        const p = part as { type?: string; text?: string }
        if (p.type === 'text') return p.text ?? ''
      }
      return ''
    })
    .join('')
    .trim()
}

function assistantThinking(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const thinking = content
    .map((part) => {
      if (part && typeof part === 'object' && 'type' in part) {
        const p = part as { type?: string; thinking?: string }
        if (p.type === 'thinking') return p.thinking ?? ''
      }
      return ''
    })
    .join('\n')
    .trim()
  return thinking || undefined
}

function toolCallsFromContent(content: unknown): ToolCard[] | undefined {
  if (!Array.isArray(content)) return undefined
  const cards = content.flatMap((part): ToolCard[] => {
    if (!part || typeof part !== 'object' || !('type' in part)) return []
    const p = part as { type?: string; id?: string; name?: string; arguments?: Record<string, unknown> }
    if (p.type !== 'toolCall') return []
    if (!p.id) return []
    return [
      {
        toolCallId: p.id,
        toolName: p.name || 'tool',
        args: p.arguments || {},
        output: '',
        isError: false,
      },
    ]
  })
  return cards.length > 0 ? cards : undefined
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
