// Owner: agent "sessions-core". Claude Agent SDK session manager.
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { z } from 'zod'
import type { CliSessionInfo, ModelInfo, PermissionMode, SessionKind, SessionMeta, SlashCommand } from '@shared/ipc'
import type { Options, SDKControlInitializeResponse } from '@anthropic-ai/claude-agent-sdk'
import { emit, handle } from '../core/ipc'
import { log } from '../core/log'
import { getSettings } from '../core/settings'
import { bus } from '../core/bus'
import { convertCliTranscript, findCliSessionFile, listCliSessionFiles, summarizeCliSession } from './cli'
import { appendItems, deleteSessionFiles, loadAllMetas, type StoredMeta } from './persist'
import { chatScratchDir, SessionRuntime } from './runtime'
import { claudeExecutable, loadSdk, spawnEnv } from './sdk'
import { canonicalPath, checkTrust, trustFolder } from './trust'
import { createWorktree, gitRepoRoot, removeWorktree } from './worktree'

const sessions = new Map<string, SessionRuntime>()

const permissionModeSchema = z.enum(['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'])
const effortSchema = z.enum(['', 'low', 'medium', 'high', 'xhigh', 'max'])
const idSchema = z.string().min(1).max(200)
const attachmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), mediaType: z.string().regex(/^image\/(png|jpeg|gif|webp)$/), dataBase64: z.string().max(30_000_000), name: z.string().optional() }),
  z.object({ type: z.literal('file'), path: z.string().min(1).max(4096) })
])
const createSchema = z.object({
  kind: z.enum(['code', 'chat']),
  cwd: z.string().optional(),
  model: z.string().max(200).optional(),
  permissionMode: permissionModeSchema.optional(),
  effort: effortSchema.optional(),
  title: z.string().max(200).optional(),
  useWorktree: z.boolean().optional(),
  baseBranch: z.string().max(250).regex(/^[^\s~^:?*[\\]+$/).optional()
})
const forkSchema = z.object({ sessionId: idSchema, atItemId: z.string().max(300).optional() })
const sendSchema = z.object({ sessionId: idSchema, text: z.string().max(1_000_000), attachments: z.array(attachmentSchema).max(20).optional() })
const respondSchema = z.object({
  sessionId: idSchema,
  requestId: idSchema,
  decision: z.enum(['allow', 'deny']),
  scope: z.enum(['once', 'session', 'always']),
  updatedInput: z.record(z.string(), z.unknown()).optional(),
  message: z.string().max(10_000).optional()
})
const updateSchema = z.object({
  sessionId: idSchema,
  patch: z.object({
    title: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    permissionMode: permissionModeSchema.optional(),
    effort: effortSchema.optional(),
    archived: z.boolean().optional()
  })
})

function get(id: string): SessionRuntime {
  const s = sessions.get(idSchema.parse(id))
  if (!s) throw new Error(`Unknown session ${id}`)
  return s
}

function register(meta: StoredMeta): SessionRuntime {
  const rt = new SessionRuntime(meta)
  sessions.set(meta.id, rt)
  return rt
}

function loadSessions(): void {
  for (const meta of loadAllMetas()) {
    // Nothing is running right after startup.
    const fixed: StoredMeta = { ...meta, status: meta.status === 'error' ? 'error' : 'idle', queued: 0 }
    register(fixed)
  }
  log.info(`[sessions] loaded ${sessions.size} sessions`)
}

// ---------- create ----------
type CreateOpts = z.infer<typeof createSchema>

async function createSessionInternal(opts: CreateOpts, o: { requireTrust: boolean; nameHint?: string }): Promise<SessionRuntime> {
  const s = getSettings()
  let cwd: string | null = null
  let worktree: SessionMeta['worktree'] = null
  let pendingWorktree: StoredMeta['pendingWorktree']
  if (opts.kind === 'code') {
    if (!opts.cwd) throw new Error('A folder is required for code sessions')
    const trust = await checkTrust(opts.cwd)
    if (!trust.trusted && (trust.blocked || o.requireTrust)) throw new Error(trust.reason ?? 'Folder is not trusted')
    cwd = canonicalPath(opts.cwd)
    const name = opts.title?.trim() || o.nameHint?.trim()
    if (opts.useWorktree && !name) {
      await gitRepoRoot(cwd) // fail fast; the worktree itself is named after the first message
      pendingWorktree = { originCwd: cwd, baseBranch: opts.baseBranch }
    } else if (opts.useWorktree && name) {
      const created = await createWorktree(cwd, name, opts.baseBranch)
      worktree = created.info
      cwd = created.cwd
      log.info(`[sessions] worktree ${created.info.path} (${created.info.branch} from ${created.info.baseBranch}), copied ${created.copiedFiles} included files`)
    }
  }
  const now = Date.now()
  const meta: StoredMeta = {
    id: randomUUID(),
    kind: opts.kind,
    title: opts.title?.trim() || (opts.kind === 'chat' ? 'New chat' : 'New session'),
    titleSource: opts.title?.trim() ? 'user' : 'auto',
    cwd,
    model: opts.model ?? s.defaultModel,
    effort: opts.effort ?? s.defaultEffort,
    permissionMode: opts.permissionMode ?? (opts.kind === 'chat' ? 'default' : s.defaultPermissionMode),
    status: 'idle',
    sdkSessionId: null,
    createdAt: now,
    lastActivityAt: now,
    archived: false,
    queued: 0,
    worktree,
    pendingWorktree
  }
  if (meta.kind === 'chat') chatScratchDir(meta.id)
  const rt = register(meta)
  rt.update({})
  return rt
}

async function createSession(raw: unknown): Promise<SessionMeta> {
  return (await createSessionInternal(createSchema.parse(raw), { requireTrust: true })).publicMeta()
}

/**
 * Internal API (automation): create a session and send the first message. No trust prompt — the user
 * trusted the folder when creating the task — but blocked folders (home, root, network, missing) are refused.
 */
export async function createAndSend(opts: { kind: SessionKind; cwd: string | null; text: string; title?: string; model?: string; permissionMode?: PermissionMode; useWorktree?: boolean }): Promise<SessionMeta> {
  const parsed = createSchema.parse({ kind: opts.kind, cwd: opts.cwd ?? undefined, title: opts.title, model: opts.model, permissionMode: opts.permissionMode, useWorktree: opts.useWorktree })
  const rt = await createSessionInternal(parsed, { requireTrust: false, nameHint: opts.text })
  rt.send({ text: z.string().min(1).max(1_000_000).parse(opts.text) })
  return rt.publicMeta()
}

// ---------- fork ----------
async function forkSession(raw: unknown): Promise<SessionMeta> {
  const { sessionId, atItemId } = forkSchema.parse(raw)
  const src = get(sessionId)
  const stored = src.getStoredTranscript()
  let cut = stored.length
  if (atItemId) {
    const idx = stored.findIndex((x) => x.item.id === atItemId)
    if (idx < 0) throw new Error('That message is no longer in the transcript')
    if (stored[idx].item.type === 'user') {
      cut = idx // forking at a prompt = continue from just before it
    } else {
      let end = idx // keep the whole turn so no tool_use is left dangling
      while (end < stored.length && stored[end].item.type !== 'result') end++
      cut = Math.min(end + 1, stored.length)
    }
  }
  const kept = stored.slice(0, cut)
  const fullFork = !atItemId || cut === stored.length
  const resumeAt = fullFork ? undefined : [...kept].reverse().find((x) => x.sdkUuid && x.item.type !== 'user')?.sdkUuid
  const canResume = !!src.meta.sdkSessionId && (fullFork || !!resumeAt)
  const now = Date.now()
  const m = src.meta
  const meta: StoredMeta = {
    id: randomUUID(),
    kind: m.kind,
    title: `Fork of ${m.title}`.slice(0, 200),
    titleSource: 'user',
    cwd: m.cwd,
    model: m.model,
    effort: m.effort,
    permissionMode: m.permissionMode,
    status: 'idle',
    sdkSessionId: null,
    createdAt: now,
    lastActivityAt: now,
    archived: false,
    queued: 0,
    worktree: null, // the worktree stays owned by the source session
    forkedFrom: { sessionId: m.id, itemId: atItemId },
    forkSource: canResume ? { sdkSessionId: m.sdkSessionId!, resumeAt } : undefined
  }
  if (meta.kind === 'chat') chatScratchDir(meta.id)
  appendItems(meta.id, kept)
  return register(meta).update({})
}

async function updateSession(raw: unknown): Promise<SessionMeta> {
  const { sessionId, patch } = updateSchema.parse(raw)
  const rt = get(sessionId)
  const extra: Partial<StoredMeta> = {}
  if (patch.title !== undefined) {
    extra.title = patch.title.trim() || rt.meta.title
    extra.titleSource = 'user'
  }
  const live = { model: patch.model, permissionMode: patch.permissionMode, effort: patch.effort }
  const meta = rt.update({ ...patch, ...extra })
  await rt.applyLive(live)
  if (patch.archived) rt.stopQuery()
  return meta
}

async function deleteSession(id: string): Promise<void> {
  const rt = get(id)
  rt.dispose()
  const wt = rt.meta.worktree
  if (wt) await removeWorktree(wt, true).catch((e) => log.warn(`[sessions] could not remove worktree ${wt.path}`, String(e)))
  sessions.delete(rt.meta.id)
  deleteSessionFiles(rt.meta.id)
  emit('sessions:removed', { sessionId: rt.meta.id })
  bus.emitBus('session:removed', { sessionId: rt.meta.id })
}

async function removeSessionWorktree(id: string): Promise<void> {
  const rt = get(id)
  const wt = rt.meta.worktree
  if (!wt) return
  if (rt.isRunning) throw new Error('Stop the session before removing its worktree')
  rt.stopQuery()
  await removeWorktree(wt)
  rt.update({ worktree: null })
}

// ---------- probing (models / commands) ----------
const STATIC_MODELS: ModelInfo[] = [
  { value: '', displayName: 'Default', description: 'Use the default model from your Claude Code settings' },
  { value: 'opus', displayName: 'Opus', description: 'Most capable for complex work' },
  { value: 'sonnet', displayName: 'Sonnet', description: 'Best for everyday tasks' },
  { value: 'haiku', displayName: 'Haiku', description: 'Fastest for quick answers' }
]
let modelsCache: ModelInfo[] | null = null
const commandsCache = new Map<string, { at: number; commands: SlashCommand[] }>()
const COMMANDS_TTL = 5 * 60 * 1000

/** Starts a throwaway CLI process (no prompt sent) to read its initialize response. */
async function probe(cwd: string, extra: Partial<Options> = {}): Promise<SDKControlInitializeResponse> {
  const { query } = await loadSdk()
  const empty: AsyncIterable<never> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<never>>(() => {}) }) }
  const q = query({
    prompt: empty,
    options: {
      cwd,
      pathToClaudeCodeExecutable: await claudeExecutable(),
      env: await spawnEnv(),
      settingSources: ['user', 'project', 'local'],
      persistSession: false,
      ...extra
    }
  })
  const drain = (async () => { try { for await (const _ of q) { /* ignore */ } } catch { /* closed */ } })()
  try {
    return await Promise.race([
      q.initializationResult(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timed out probing Claude Code')), 30_000))
    ])
  } finally {
    q.close()
    void drain
  }
}

function toModelInfo(models: SDKControlInitializeResponse['models']): ModelInfo[] {
  return models.map((m) => ({ value: m.value, displayName: m.displayName, description: m.description }))
}

async function listModels(): Promise<ModelInfo[]> {
  if (modelsCache) return modelsCache
  try {
    const live = [...sessions.values()].find((s) => s.liveQuery)?.liveQuery
    const models = live ? await live.supportedModels() : (await probe(homedir())).models
    if (models.length) modelsCache = toModelInfo(models)
  } catch (e) {
    log.warn('[sessions] listModels failed, using fallback', String(e))
  }
  return modelsCache ?? STATIC_MODELS
}

function commandSource(c: { name: string; builtin?: boolean }, skills: Set<string>): SlashCommand['source'] {
  if (c.builtin) return 'builtin'
  if (c.name.startsWith('mcp__') || c.name.includes('(MCP)')) return 'mcp'
  if (skills.has(c.name)) return 'skill'
  if (c.name.includes(':')) return 'plugin'
  return 'user'
}

async function listCommands(sessionId: string): Promise<SlashCommand[]> {
  const rt = get(sessionId)
  const key = rt.meta.cwd ?? `chat:${rt.meta.id}`
  const cached = commandsCache.get(key)
  if (cached && Date.now() - cached.at < COMMANDS_TTL && !rt.liveQuery) return cached.commands
  try {
    const live = rt.liveQuery
    const raw = live ? await live.supportedCommands() : (await probe(rt.meta.cwd ?? chatScratchDir(rt.meta.id))).commands
    const skills = new Set(rt.skills)
    const commands = raw.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint || undefined, source: commandSource(c, skills) }))
    commandsCache.set(key, { at: Date.now(), commands })
    return commands
  } catch (e) {
    log.warn('[sessions] listCommands failed', String(e))
    return cached?.commands ?? []
  }
}

// ---------- search ----------
function searchSessions(query: string): { sessionId: string; snippet: string; lastActivityAt: number }[] {
  const q = z.string().max(500).parse(query).trim().toLowerCase()
  if (!q) return []
  const out: { sessionId: string; snippet: string; lastActivityAt: number }[] = []
  for (const rt of sessions.values()) {
    const { id, title, lastActivityAt } = rt.meta
    let snippet: string | null = title.toLowerCase().includes(q) ? title : null
    if (!snippet) {
      for (const item of rt.getTranscript()) {
        const text = item.type === 'user' || item.type === 'assistant' ? item.text : null
        if (!text) continue
        const i = text.toLowerCase().indexOf(q)
        if (i < 0) continue
        const start = Math.max(0, i - 60)
        const end = Math.min(text.length, i + q.length + 60)
        snippet = `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
        break
      }
    }
    if (snippet) out.push({ sessionId: id, snippet, lastActivityAt })
  }
  return out.sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 100)
}

// ---------- CLI import ----------
function importedIds(): Set<string> {
  return new Set([...sessions.values()].map((s) => s.meta.sdkSessionId).filter((x): x is string => !!x))
}

async function listCliSessions(): Promise<CliSessionInfo[]> {
  const imported = importedIds()
  const files = listCliSessionFiles().slice(0, 300)
  const out: CliSessionInfo[] = []
  for (const f of files) {
    try {
      const sum = await summarizeCliSession(f)
      if (!sum.cwd || !sum.messageCount) continue
      out.push({ cliSessionId: f.id, cwd: sum.cwd, title: sum.title, lastActivityAt: sum.lastActivityAt, messageCount: sum.messageCount, alreadyImported: imported.has(f.id) })
    } catch (e) { log.warn(`[sessions] could not read CLI session ${f.id}`, String(e)) }
  }
  return out
}

async function importCli(ids: unknown): Promise<SessionMeta[]> {
  const list = z.array(idSchema).max(500).parse(ids)
  const imported = importedIds()
  const out: SessionMeta[] = []
  for (const cliId of list) {
    if (imported.has(cliId)) continue
    const f = findCliSessionFile(cliId)
    if (!f) continue
    const sum = await summarizeCliSession(f)
    if (!sum.cwd) continue
    const trust = await checkTrust(sum.cwd)
    if (!trust.trusted && !trust.blocked) await trustFolder(sum.cwd).catch(() => {})
    const s = getSettings()
    const meta: StoredMeta = {
      id: randomUUID(),
      kind: 'code',
      title: sum.title,
      titleSource: 'user',
      cwd: sum.cwd,
      model: s.defaultModel,
      effort: s.defaultEffort,
      permissionMode: s.defaultPermissionMode,
      status: 'idle',
      sdkSessionId: cliId,
      createdAt: Math.round(f.mtimeMs),
      lastActivityAt: sum.lastActivityAt,
      archived: false,
      importedFrom: 'cli',
      queued: 0
    }
    appendItems(meta.id, await convertCliTranscript(f))
    out.push(register(meta).update({}))
    imported.add(cliId)
  }
  return out
}

// ---------- registration ----------
export function registerSessions(): void {
  loadSessions()

  handle('sessions:list', (opts) =>
    [...sessions.values()]
      .map((s) => s.publicMeta())
      .filter((m) => opts?.includeArchived || !m.archived)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  )
  handle('sessions:get', (id) => sessions.get(id)?.publicMeta() ?? null)
  handle('sessions:create', (opts) => createSession(opts))
  handle('sessions:fork', (opts) => forkSession(opts))
  handle('sessions:contextUsage', (id) => get(id).contextUsage())
  handle('sessions:removeWorktree', (id) => removeSessionWorktree(id))
  handle('sessions:send', (raw) => {
    const { sessionId, text, attachments } = sendSchema.parse(raw)
    const rt = get(sessionId)
    if (rt.meta.kind === 'code' && rt.meta.cwd && !existsSync(rt.meta.cwd)) throw new Error(`Folder not found: ${rt.meta.cwd}`)
    rt.send({ text, attachments })
  })
  handle('sessions:interrupt', (id) => get(id).interrupt())
  handle('sessions:respondPermission', (raw) => {
    const r = respondSchema.parse(raw)
    get(r.sessionId).respond(r)
  })
  handle('sessions:pendingPermissions', (id) => get(id).pendingRequests())
  handle('sessions:update', (raw) => updateSession(raw))
  handle('sessions:delete', (id) => deleteSession(id))
  handle('sessions:getTranscript', (id) => get(id).getTranscript())
  handle('sessions:listModels', () => listModels())
  handle('sessions:listCommands', (id) => listCommands(id))
  handle('sessions:search', (q) => searchSessions(q))
  handle('sessions:listCliSessions', () => listCliSessions())
  handle('sessions:importCli', (ids) => importCli(ids))
  handle('sessions:checkTrust', (cwd) => checkTrust(z.string().max(4096).parse(cwd)))
  handle('sessions:trustFolder', (cwd) => trustFolder(z.string().max(4096).parse(cwd)))
  handle('sessions:runningCount', () => runningSessionsCount())
}

/** Number of sessions currently running a turn (used by quit confirmation). */
export function runningSessionsCount(): number {
  let n = 0
  for (const s of sessions.values()) if (s.isRunning) n++
  return n
}

/** Close every CLI process (call on quit). */
export function stopAllSessions(): void {
  for (const s of sessions.values()) s.stopQuery()
}

