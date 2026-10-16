// One live Agent SDK query per session (streaming input mode), with a local FIFO for follow-ups.
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { EffortLevel, Options, PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Attachment, PermissionRequest, PermissionResponse, SessionMeta, SessionStatus, TranscriptItem } from '@shared/ipc'
import { emit } from '../core/ipc'
import { bus } from '../core/bus'
import { log } from '../core/log'
import { dataPath } from '../core/store'
import { getSettings, setSettings } from '../core/settings'
import { getEnabledMcpServers } from '../mcp'
import { Normalizer } from './normalize'
import { appendItems, loadTranscript, saveMeta, type StoredMeta } from './persist'
import { INTERACTIVE_TOOLS, permissionTitle, ruleMatches, suggestRule } from './permissions'
import { claudeExecutable, loadSdk, spawnEnv } from './sdk'

const IDLE_CLOSE_MS = 15 * 60 * 1000
const CHAT_SYSTEM_PROMPT = [
  'You are Claude, a helpful, thoughtful general-purpose assistant running in the Claudio desktop app.',
  'This is a conversation, not a coding session: you have no access to the user\'s files or shell.',
  'Answer clearly and concisely, use Markdown when it helps readability, and ask clarifying questions when a request is ambiguous.'
].join(' ')

interface Outgoing { text: string; attachments?: Attachment[] }
interface PendingPermission { request: PermissionRequest; input: Record<string, unknown>; settle: (r: PermissionResult) => void }

/** Push-based AsyncIterable feeding the SDK's streaming input. */
class InputChannel implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = []
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(m: SDKUserMessage): void {
    if (this.closed) return
    if (this.waiter) { const w = this.waiter; this.waiter = null; w({ value: m, done: false }) } else this.buffer.push(m)
  }
  close(): void {
    this.closed = true
    this.waiter?.({ value: undefined, done: true })
    this.waiter = null
  }
  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const m = this.buffer.shift()
        if (m) return Promise.resolve({ value: m, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((r) => { this.waiter = r })
      },
      return: () => { this.close(); return Promise.resolve({ value: undefined, done: true }) }
    }
  }
}

export function chatScratchDir(id: string): string {
  const dir = dataPath('chat-scratch', id)
  mkdirSync(dir, { recursive: true })
  return dir
}

function toSdkMessage(o: Outgoing): SDKUserMessage {
  const mentions = (o.attachments ?? []).filter((a) => a.type === 'file').map((a) => `@${a.path}`)
  const text = [mentions.join(' '), o.text].filter(Boolean).join('\n\n')
  const images = (o.attachments ?? []).flatMap((a) => (a.type === 'image' ? [a] : []))
  const content = images.length
    ? [
        ...images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType as 'image/png', data: img.dataBase64 } })),
        ...(text ? [{ type: 'text' as const, text }] : [])
      ]
    : text
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }
}

export class SessionRuntime {
  private query: Query | null = null
  private input: InputChannel | null = null
  private normalizer: Normalizer
  private transcript: Map<string, TranscriptItem> | null = null
  private outbox: Outgoing[] = []
  private turnRunning = false
  private errored = false
  private starting: Promise<void> | null = null
  private closingIntentionally = false
  private initLogged = false
  private interruptRequested = false
  private idleTimer: NodeJS.Timeout | null = null
  private sessionRules = new Set<string>()
  private pending = new Map<string, PendingPermission>()
  /** Skill names reported by the last `system/init` message. */
  skills: string[] = []

  constructor(public meta: StoredMeta) {
    this.normalizer = new Normalizer({
      item: (item, final) => this.upsertItem(item, final),
      delta: (itemId, kind, text) => emit('sessions:delta', { sessionId: this.meta.id, itemId, kind, text })
    })
  }

  get isRunning(): boolean { return this.turnRunning }
  get liveQuery(): Query | null { return this.query }

  // ---- transcript ----
  getTranscript(): TranscriptItem[] {
    this.transcript ??= new Map(loadTranscript(this.meta.id).map((i) => [i.id, i]))
    return [...this.transcript.values()]
  }

  private upsertItem(item: TranscriptItem, final: boolean): void {
    if (this.transcript) { this.transcript.delete(item.id); this.transcript.set(item.id, item) }
    if (final) appendItems(this.meta.id, [item])
    emit('sessions:item', { sessionId: this.meta.id, item })
  }

  private systemItem(subtype: 'info' | 'error', text: string): void {
    this.upsertItem({ id: randomUUID(), type: 'system', subtype, text, createdAt: Date.now() }, true)
  }

  // ---- meta ----
  update(patch: Partial<StoredMeta>): SessionMeta {
    this.meta = { ...this.meta, ...patch }
    saveMeta(this.meta)
    emit('sessions:changed', this.publicMeta())
    return this.publicMeta()
  }

  publicMeta(): SessionMeta {
    const { titleSource: _ts, ...rest } = this.meta
    return rest
  }

  private refreshStatus(extra: Partial<StoredMeta> = {}): void {
    const status: SessionStatus = this.pending.size ? 'awaiting-permission' : this.turnRunning ? 'running' : this.errored ? 'error' : 'idle'
    this.update({ ...extra, status, queued: this.outbox.length })
  }

  // ---- sending ----
  send(o: Outgoing): void {
    if (!o.text.trim() && !o.attachments?.length) return
    if (this.turnRunning || this.starting) {
      this.outbox.push(o)
      this.refreshStatus()
      return
    }
    void this.dispatch(o)
  }

  private async dispatch(o: Outgoing): Promise<void> {
    this.clearIdleTimer()
    this.turnRunning = true
    this.errored = false
    const now = Date.now()
    this.upsertItem({ id: randomUUID(), type: 'user', text: o.text, attachments: o.attachments?.length ? o.attachments : undefined, createdAt: now }, true)
    const titlePatch = this.meta.titleSource !== 'user' && (!this.meta.title || this.meta.title === 'New session' || this.meta.title === 'New chat') && o.text.trim()
      ? { title: o.text.replace(/\s+/g, ' ').trim().slice(0, 60), titleSource: 'auto' as const }
      : {}
    this.refreshStatus({ ...titlePatch, lastActivityAt: now, lastError: undefined })
    try {
      await this.ensureQuery()
      this.input!.push(toSdkMessage(o))
    } catch (e) {
      this.failTurn(e instanceof Error ? e.message : String(e))
    }
  }

  private failTurn(message: string): void {
    log.error(`[sessions] ${this.meta.id} turn failed: ${message}`)
    this.turnRunning = false
    this.errored = true
    this.normalizer.flushStreaming()
    this.systemItem('error', message)
    const dropped = this.outbox.length
    this.outbox = []
    if (dropped) this.systemItem('info', `${dropped} queued message${dropped > 1 ? 's were' : ' was'} not sent.`)
    this.refreshStatus({ lastError: message })
    bus.emitBus('session:error', { session: this.publicMeta(), error: message })
  }

  // ---- query lifecycle ----
  private async buildOptions(): Promise<Options> {
    const m = this.meta
    const isChat = m.kind === 'chat'
    const options: Options = {
      cwd: isChat ? chatScratchDir(m.id) : m.cwd ?? undefined,
      pathToClaudeCodeExecutable: await claudeExecutable(),
      env: await spawnEnv(),
      includePartialMessages: true,
      permissionMode: m.permissionMode,
      allowDangerouslySkipPermissions: true,
      mcpServers: getEnabledMcpServers(),
      // Chats are isolated from Claude Code config (hooks, plugins, CLI MCP servers); only Claudio's MCP servers apply.
      settingSources: isChat ? [] : ['user', 'project', 'local'],
      strictMcpConfig: isChat,
      systemPrompt: isChat ? CHAT_SYSTEM_PROMPT : { type: 'preset', preset: 'claude_code' },
      canUseTool: (toolName, input, opts) => this.canUseTool(toolName, input, opts.signal),
      stderr: (d) => log.to('claude-stderr.log', 'info', `[${m.id}] ${d.trimEnd()}`)
    }
    if (isChat) options.tools = []
    if (m.model) options.model = m.model
    if (m.effort) options.effort = m.effort as EffortLevel
    if (m.sdkSessionId) options.resume = m.sdkSessionId
    return options
  }

  private ensureQuery(): Promise<void> {
    if (this.query) return Promise.resolve()
    this.starting ??= (async () => {
      try {
        const { query } = await loadSdk()
        const input = new InputChannel()
        const q = query({ prompt: input, options: await this.buildOptions() })
        this.input = input
        this.query = q
        this.closingIntentionally = false
        this.normalizer.resetProcess()
        this.initLogged = false
        void this.consume(q, input)
      } finally {
        this.starting = null
      }
    })()
    return this.starting
  }

  private async consume(q: Query, input: InputChannel): Promise<void> {
    let failure: string | null = null
    try {
      for await (const msg of q) this.onMessage(msg)
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e)
    } finally {
      input.close()
      if (this.query === q) { this.query = null; this.input = null }
      this.rejectAllPending('Session stopped')
      if (this.turnRunning) {
        this.failTurn(failure ?? 'Claude Code exited unexpectedly.')
      } else if (failure && !this.closingIntentionally) {
        log.warn(`[sessions] ${this.meta.id} query ended: ${failure}`)
      }
      this.normalizer.flushStreaming()
    }
  }

  private onMessage(msg: SDKMessage): void {
    if ('session_id' in msg && typeof msg.session_id === 'string' && msg.session_id && msg.session_id !== this.meta.sdkSessionId) {
      this.update({ sdkSessionId: msg.session_id })
    }
    if (msg.type === 'system' && msg.subtype === 'init') {
      this.skills = msg.skills ?? []
      if (!this.initLogged) {
        this.initLogged = true
        log.info(`[sessions] ${this.meta.id} init: claude ${msg.claude_code_version}, model ${msg.model}, apiKeySource=${msg.apiKeySource}`)
      }
      if (msg.permissionMode !== this.meta.permissionMode) this.update({ permissionMode: msg.permissionMode })
    }
    if (msg.type === 'system' && msg.subtype === 'status' && msg.permissionMode && msg.permissionMode !== this.meta.permissionMode) {
      this.update({ permissionMode: msg.permissionMode })
    }
    if (msg.type === 'assistant' && msg.parent_tool_use_id === null) {
      const u = msg.message.usage
      if (u) {
        const contextTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        const usage = this.meta.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
        this.meta = { ...this.meta, usage: { ...usage, contextTokens } }
      }
    }
    this.normalizer.handle(msg)
    if (msg.type === 'result') this.onTurnFinished(msg.is_error || msg.subtype !== 'success', msg)
  }

  private onTurnFinished(reportedError: boolean, msg: Extract<SDKMessage, { type: 'result' }>): void {
    this.turnRunning = false
    const interrupted = this.interruptRequested
    this.interruptRequested = false
    const isError = reportedError && !interrupted
    let inputTokens = 0
    let outputTokens = 0
    for (const mu of Object.values(msg.modelUsage ?? {})) {
      inputTokens += mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens
      outputTokens += mu.outputTokens
    }
    const usage = { inputTokens, outputTokens, costUsd: msg.total_cost_usd, contextTokens: this.meta.usage?.contextTokens }
    const errorText = msg.subtype === 'success' ? undefined : msg.errors?.join('\n') || msg.subtype
    const next = this.outbox.shift()
    this.refreshStatus({ usage, lastActivityAt: Date.now(), ...(isError && errorText ? { lastError: errorText } : {}) })
    const summary = interrupted ? 'Interrupted' : msg.subtype === 'success' ? msg.result.slice(0, 200) : errorText
    bus.emitBus('session:turn-finished', { session: this.publicMeta(), isError, summary })
    if (next) void this.dispatch(next)
    else this.armIdleTimer()
  }

  private armIdleTimer(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => { if (!this.turnRunning && !this.pending.size) this.stopQuery() }, IDLE_CLOSE_MS)
  }
  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  /** Ends the CLI process; the next send resumes via sdkSessionId. */
  stopQuery(): void {
    this.clearIdleTimer()
    if (!this.query) return
    this.closingIntentionally = true
    this.input?.close()
    try { this.query.close() } catch { /* already gone */ }
  }

  async interrupt(): Promise<void> {
    const dropped = this.outbox.length
    this.outbox = []
    if (dropped) this.systemItem('info', `${dropped} queued message${dropped > 1 ? 's' : ''} discarded.`)
    if (this.query && this.turnRunning) {
      this.interruptRequested = true
      this.normalizer.markInterrupted()
      try { await this.query.interrupt() } catch (e) { log.warn('[sessions] interrupt failed', String(e)) }
    }
    this.refreshStatus()
  }

  async applyLive(patch: Partial<Pick<SessionMeta, 'model' | 'permissionMode' | 'effort'>>): Promise<void> {
    const q = this.query
    if (!q) return
    try {
      if (patch.model !== undefined) await q.setModel(patch.model || undefined)
      if (patch.permissionMode !== undefined) await q.setPermissionMode(patch.permissionMode)
      if (patch.effort !== undefined) await q.applyFlagSettings({ effortLevel: (patch.effort || null) as EffortLevel | null })
    } catch (e) {
      log.warn('[sessions] live update failed', String(e))
    }
  }

  // ---- permissions ----
  pendingRequests(): PermissionRequest[] {
    return [...this.pending.values()].map((p) => p.request)
  }

  private rulesKey(): string {
    return this.meta.cwd ?? `chat:${this.meta.id}`
  }

  private isPreApproved(toolName: string, input: Record<string, unknown>): boolean {
    if (INTERACTIVE_TOOLS.has(toolName)) return false
    const rules = [...(getSettings().alwaysAllow[this.rulesKey()] ?? []), ...this.sessionRules]
    return rules.some((r) => ruleMatches(r, toolName, input))
  }

  private canUseTool(toolName: string, input: Record<string, unknown>, signal: AbortSignal): Promise<PermissionResult> {
    if (this.isPreApproved(toolName, input)) return Promise.resolve({ behavior: 'allow', updatedInput: input })
    const request: PermissionRequest = {
      sessionId: this.meta.id,
      requestId: randomUUID(),
      toolName,
      input,
      title: permissionTitle(toolName, input),
      suggestedRule: INTERACTIVE_TOOLS.has(toolName) ? undefined : suggestRule(toolName, input),
      createdAt: Date.now()
    }
    return new Promise<PermissionResult>((resolve) => {
      const onAbort = () => this.settle(request.requestId, { behavior: 'deny', message: 'Request was cancelled' })
      this.pending.set(request.requestId, {
        request,
        input,
        settle: (r) => { signal.removeEventListener('abort', onAbort); resolve(r) }
      })
      signal.addEventListener('abort', onAbort, { once: true })
      this.refreshStatus()
      emit('sessions:permission', request)
      bus.emitBus('session:permission-requested', { session: this.publicMeta(), request })
    })
  }

  private settle(requestId: string, result: PermissionResult): void {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    p.settle(result)
    emit('sessions:permissionResolved', { sessionId: this.meta.id, requestId })
    this.refreshStatus()
  }

  private rejectAllPending(message: string): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { behavior: 'deny', message })
  }

  respond(r: PermissionResponse): void {
    const p = this.pending.get(r.requestId)
    if (!p) return
    if (r.decision === 'deny') {
      this.settle(r.requestId, { behavior: 'deny', message: r.message?.trim() || 'The user denied this action.' })
      return
    }
    const rule = p.request.suggestedRule
    if (rule && r.scope === 'session') this.sessionRules.add(rule)
    if (rule && r.scope === 'always') {
      const s = getSettings()
      const key = this.rulesKey()
      const existing = s.alwaysAllow[key] ?? []
      if (!existing.includes(rule)) setSettings({ alwaysAllow: { ...s.alwaysAllow, [key]: [...existing, rule] } })
    }
    this.settle(r.requestId, { behavior: 'allow', updatedInput: r.updatedInput ?? p.input })
  }

  dispose(): void {
    this.rejectAllPending('Session deleted')
    this.outbox = []
    this.turnRunning = false
    this.stopQuery()
  }
}
