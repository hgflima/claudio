// SDKMessage → TranscriptItem. Owns the streaming state that pairs stream_event blocks with final assistant blocks.
import { randomUUID } from 'node:crypto'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { TranscriptItem } from '@shared/ipc'

export interface NormalizeSink {
  /** Upsert an item. `final` items are persisted. */
  item(item: TranscriptItem, final: boolean): void
  delta(itemId: string, kind: 'assistant' | 'thinking', text: string): void
}

type StreamKind = 'text' | 'thinking' | 'tool_use'
interface StreamBlock { index: number; kind: StreamKind; itemId: string; text: string; consumed: boolean; createdAt: number }

type Block = { type: string; [k: string]: unknown }
const asBlocks = (c: unknown): Block[] => (Array.isArray(c) ? (c as Block[]) : typeof c === 'string' ? [{ type: 'text', text: c }] : [])
const s = (v: unknown): string => (typeof v === 'string' ? v : '')

export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  return asBlocks(content)
    .map((b) => (b.type === 'text' ? s(b.text) : b.type === 'image' ? '[image]' : ''))
    .filter(Boolean)
    .join('\n')
}

export class Normalizer {
  private messages = new Map<string, StreamBlock[]>()
  private currentMessageId: string | null = null
  private initShown = false
  private interrupted = false

  constructor(private sink: NormalizeSink) {}

  handle(msg: SDKMessage): void {
    switch (msg.type) {
      case 'stream_event':
        if (msg.parent_tool_use_id === null) this.onStream(msg.event as unknown as Block)
        return
      case 'assistant':
        this.onAssistant(msg.message.id, asBlocks(msg.message.content), msg.parent_tool_use_id)
        return
      case 'user':
        if ('isReplay' in msg && msg.isReplay) return
        this.onUser(msg.message.content)
        return
      case 'system':
        this.onSystem(msg as unknown as Block)
        return
      case 'result': {
        this.flushStreaming()
        const interrupted = this.interrupted
        this.interrupted = false
        this.sink.item({
          id: randomUUID(),
          type: 'result',
          isError: !interrupted && (msg.is_error || msg.subtype !== 'success'),
          durationMs: msg.duration_ms,
          numTurns: msg.num_turns,
          costUsd: msg.total_cost_usd,
          text: interrupted ? 'Interrupted' : msg.subtype === 'success' ? undefined : msg.errors?.join('\n') || msg.subtype.replace(/_/g, ' '),
          createdAt: Date.now()
        }, true)
        return
      }
    }
  }

  /** The next result belongs to a turn the user stopped. */
  markInterrupted(): void {
    this.interrupted = true
  }

  /** Call when a new CLI process starts. */
  resetProcess(): void {
    this.initShown = false
  }

  /** Finalize streaming items that never got a complete assistant message (interrupt, crash). */
  flushStreaming(): void {
    for (const blocks of this.messages.values()) {
      for (const b of blocks) {
        if (b.consumed || b.kind === 'tool_use') continue
        b.consumed = true
        if (!b.text) continue
        this.sink.item({ id: b.itemId, type: b.kind === 'text' ? 'assistant' : 'thinking', text: b.text, streaming: false, createdAt: b.createdAt }, true)
      }
    }
    this.messages.clear()
    this.currentMessageId = null
  }

  private onStream(ev: Block): void {
    if (ev.type === 'message_start') {
      const id = s((ev.message as Block | undefined)?.id) || randomUUID()
      this.currentMessageId = id
      if (!this.messages.has(id)) this.messages.set(id, [])
      return
    }
    const blocks = this.currentMessageId ? this.messages.get(this.currentMessageId) : undefined
    if (!blocks) return
    const index = typeof ev.index === 'number' ? ev.index : -1
    if (ev.type === 'content_block_start') {
      const cb = (ev.content_block ?? {}) as Block
      const kind: StreamKind | null = cb.type === 'text' ? 'text' : cb.type === 'thinking' ? 'thinking' : cb.type === 'tool_use' || cb.type === 'server_tool_use' ? 'tool_use' : null
      if (!kind) return
      const block: StreamBlock = { index, kind, itemId: randomUUID(), text: s(cb.text) || s(cb.thinking), consumed: false, createdAt: Date.now() }
      blocks.push(block)
      if (kind !== 'tool_use') {
        this.sink.item({ id: block.itemId, type: kind === 'text' ? 'assistant' : 'thinking', text: block.text, streaming: true, createdAt: block.createdAt }, false)
      }
      return
    }
    if (ev.type === 'content_block_delta') {
      const block = blocks.find((b) => b.index === index && !b.consumed)
      const d = (ev.delta ?? {}) as Block
      if (!block) return
      if (d.type === 'text_delta' && block.kind === 'text') {
        block.text += s(d.text)
        this.sink.delta(block.itemId, 'assistant', s(d.text))
      } else if (d.type === 'thinking_delta' && block.kind === 'thinking') {
        block.text += s(d.thinking)
        this.sink.delta(block.itemId, 'thinking', s(d.thinking))
      }
    }
  }

  private claim(messageId: string, kind: StreamKind): StreamBlock | undefined {
    const block = this.messages.get(messageId)?.find((b) => b.kind === kind && !b.consumed)
    if (block) block.consumed = true
    return block
  }

  private onAssistant(messageId: string, content: Block[], parentToolUseId: string | null): void {
    const now = Date.now()
    for (const b of content) {
      if (b.type === 'text' || b.type === 'thinking') {
        const kind = b.type
        const text = kind === 'text' ? s(b.text) : s(b.thinking)
        const streamed = parentToolUseId === null ? this.claim(messageId, kind) : undefined
        if (!text && !streamed) continue
        // An empty final still closes the streaming placeholder in the UI, but isn't persisted.
        this.sink.item({ id: streamed?.itemId ?? randomUUID(), type: kind === 'text' ? 'assistant' : 'thinking', text, streaming: false, createdAt: streamed?.createdAt ?? now }, !!text)
      } else if (b.type === 'tool_use' || b.type === 'server_tool_use' || b.type === 'mcp_tool_use') {
        if (parentToolUseId === null) this.claim(messageId, 'tool_use')
        const toolUseId = s(b.id)
        const name = b.type === 'mcp_tool_use' ? `mcp__${s(b.server_name)}__${s(b.name)}` : s(b.name)
        this.sink.item({ id: `tool_use:${toolUseId}`, type: 'tool_use', toolUseId, name, input: b.input ?? {}, parentToolUseId, createdAt: now }, true)
      }
    }
  }

  private onUser(content: unknown): void {
    for (const b of asBlocks(content)) {
      if (b.type !== 'tool_result') continue
      const toolUseId = s(b.tool_use_id)
      this.sink.item({ id: `tool_result:${toolUseId}`, type: 'tool_result', toolUseId, content: toolResultText(b.content), isError: b.is_error === true || undefined, createdAt: Date.now() }, true)
    }
  }

  private onSystem(m: Block): void {
    const now = Date.now()
    const sys = (subtype: 'init' | 'compact' | 'info' | 'error', text: string) =>
      this.sink.item({ id: randomUUID(), type: 'system', subtype, text, createdAt: now }, true)
    switch (m.subtype) {
      case 'init': {
        // The CLI re-sends init on every turn of a streaming query; show it once per process.
        if (this.initShown) return
        this.initShown = true
        const tools = Array.isArray(m.tools) ? m.tools.length : 0
        sys('init', `${s(m.model) || 'default model'} · ${tools} tools · ${s(m.permissionMode)}`)
        return
      }
      case 'compact_boundary': {
        const meta = (m.compact_metadata ?? {}) as Block
        sys('compact', `Conversation compacted (${s(meta.trigger) || 'auto'})`)
        return
      }
      case 'local_command_output':
      case 'informational':
        if (s(m.content)) sys('info', s(m.content))
        return
      case 'api_retry':
        sys('info', `API error, retrying (attempt ${String(m.attempt)}/${String(m.max_retries)})…`)
        return
    }
  }
}
