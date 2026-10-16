import { create } from 'zustand'
import { api } from '@/lib/api'
import { useUi } from '@/stores/ui'
import type {
  Attachment,
  Invoke,
  ModelInfo,
  PermissionMode,
  PermissionRequest,
  PermissionResponse,
  SessionMeta,
  TranscriptItem,
  TrustCheck
} from '@shared/ipc'

export interface Transcript {
  status: 'loading' | 'ready' | 'error'
  ids: string[] // every item, in arrival order
  topIds: string[] // items rendered at the top level of the transcript
  items: Record<string, TranscriptItem>
  results: Record<string, string> // toolUseId -> tool_result item id
  children: Record<string, string[]> // parent toolUseId -> child tool_use item ids
  error?: string
}

export interface PendingStart {
  cwd: string
  text: string
  attachments: Attachment[]
  check: Extract<TrustCheck, { trusted: false }>
  worktree?: { baseBranch?: string }
}

interface Draft {
  cwd: string | null // null = chat
  model: string
  permissionMode: PermissionMode | null // null = settings default
  useWorktree: boolean
  baseBranch: string // '' = current branch
}

interface SessionsState {
  sessions: Record<string, SessionMeta>
  listStatus: 'idle' | 'loading' | 'ready' | 'error'
  showArchived: boolean
  transcripts: Record<string, Transcript>
  permissions: Record<string, PermissionRequest[]>
  draft: Draft
  pendingStart: PendingStart | null
  closedStack: string[]
  focusTick: number
  homeEpoch: number // bumped to remount Home with a fresh draft (deep links)
  findOpen: boolean
  setFindOpen: (v: boolean) => void
  models: ModelInfo[] | null
  setShowArchived: (v: boolean) => void
  setDraft: (patch: Partial<Draft>) => void
  focusComposer: () => void
}

export const useSessions = create<SessionsState>((set) => ({
  sessions: {},
  listStatus: 'idle',
  showArchived: false,
  transcripts: {},
  permissions: {},
  draft: { cwd: null, model: '', permissionMode: null, useWorktree: false, baseBranch: '' },
  pendingStart: null,
  closedStack: [],
  focusTick: 0,
  homeEpoch: 0,
  findOpen: false,
  setFindOpen: (v) => set({ findOpen: v }),
  models: null,
  setShowArchived: (v) => set({ showArchived: v }),
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  focusComposer: () => set((s) => ({ focusTick: s.focusTick + 1 }))
}))

const get = useSessions.getState
const set = useSessions.setState

// ---------- transcript helpers ----------

const emptyTranscript = (status: Transcript['status']): Transcript => ({
  status, ids: [], topIds: [], items: {}, results: {}, children: {}
})

function isTop(item: TranscriptItem): boolean {
  if (item.type === 'tool_result') return false
  if (item.type === 'tool_use' && item.parentToolUseId) return false
  return true
}

function upsertInto(t: Transcript, item: TranscriptItem): Transcript {
  const exists = item.id in t.items
  const items = { ...t.items, [item.id]: item }
  if (exists) return { ...t, items }
  const next: Transcript = { ...t, items, ids: [...t.ids, item.id] }
  if (isTop(item)) next.topIds = [...t.topIds, item.id]
  if (item.type === 'tool_result') next.results = { ...t.results, [item.toolUseId]: item.id }
  if (item.type === 'tool_use' && item.parentToolUseId) {
    const p = item.parentToolUseId
    next.children = { ...t.children, [p]: [...(t.children[p] ?? []), item.id] }
  }
  return next
}

function buildTranscript(items: TranscriptItem[]): Transcript {
  let t = emptyTranscript('ready')
  for (const it of items) t = upsertInto(t, it)
  return t
}

function patchTranscript(sessionId: string, fn: (t: Transcript) => Transcript): void {
  const t = get().transcripts[sessionId]
  if (!t) return
  set((s) => ({ transcripts: { ...s.transcripts, [sessionId]: fn(t) } }))
}

// Events that arrive while a transcript snapshot is in flight are replayed after it lands.
const pendingItems = new Map<string, TranscriptItem[]>()

export async function loadTranscript(sessionId: string, force = false): Promise<void> {
  const cur = get().transcripts[sessionId]
  if (cur && !force && cur.status !== 'error') return
  pendingItems.set(sessionId, [])
  set((s) => ({ transcripts: { ...s.transcripts, [sessionId]: emptyTranscript('loading') } }))
  try {
    const [items, perms] = await Promise.all([
      api.invoke('sessions:getTranscript', sessionId),
      api.invoke('sessions:pendingPermissions', sessionId)
    ])
    let t = buildTranscript(items)
    for (const it of pendingItems.get(sessionId) ?? []) t = upsertInto(t, it)
    set((s) => ({
      transcripts: { ...s.transcripts, [sessionId]: t },
      permissions: { ...s.permissions, [sessionId]: mergePerms(s.permissions[sessionId] ?? [], perms) }
    }))
  } catch (e) {
    set((s) => ({
      transcripts: { ...s.transcripts, [sessionId]: { ...emptyTranscript('error'), error: errMsg(e) } }
    }))
  } finally {
    pendingItems.delete(sessionId)
  }
}

function mergePerms(a: PermissionRequest[], b: PermissionRequest[]): PermissionRequest[] {
  const seen = new Set(a.map((p) => p.requestId))
  return [...a, ...b.filter((p) => !seen.has(p.requestId))]
}

// Deltas are frequent: batch them per animation frame.
type Delta = { sessionId: string; itemId: string; kind: 'assistant' | 'thinking'; text: string }
let deltaQueue: Delta[] = []
let deltaFrame = 0

function flushDeltas(): void {
  deltaFrame = 0
  const queue = deltaQueue
  deltaQueue = []
  const bySession = new Map<string, Delta[]>()
  for (const d of queue) {
    const arr = bySession.get(d.sessionId)
    if (arr) arr.push(d)
    else bySession.set(d.sessionId, [d])
  }
  const transcripts = { ...get().transcripts }
  let changed = false
  for (const [sid, deltas] of bySession) {
    let t = transcripts[sid]
    if (!t || t.status !== 'ready') continue
    for (const d of deltas) {
      const prev = t.items[d.itemId]
      if (prev && (prev.type === 'assistant' || prev.type === 'thinking')) {
        t = { ...t, items: { ...t.items, [d.itemId]: { ...prev, text: prev.text + d.text } } }
      } else if (!prev) {
        const item: TranscriptItem = { id: d.itemId, type: d.kind, text: d.text, streaming: true, createdAt: Date.now() }
        t = upsertInto(t, item)
      }
    }
    transcripts[sid] = t
    changed = true
  }
  if (changed) set({ transcripts })
}

// ---------- bootstrap / events ----------

let initialized = false

export function initSessions(): void {
  if (initialized) return
  initialized = true
  void refreshList()

  api.on('sessions:changed', (meta) => {
    set((s) => ({ sessions: { ...s.sessions, [meta.id]: meta } }))
  })
  api.on('sessions:removed', ({ sessionId }) => {
    set((s) => {
      const { [sessionId]: _m, ...sessions } = s.sessions
      const { [sessionId]: _t, ...transcripts } = s.transcripts
      const { [sessionId]: _p, ...permissions } = s.permissions
      return { sessions, transcripts, permissions, closedStack: s.closedStack.filter((id) => id !== sessionId) }
    })
    if (useUi.getState().activeSessionId === sessionId) useUi.getState().setActiveSession(null)
  })
  api.on('sessions:item', ({ sessionId, item }) => {
    const t = get().transcripts[sessionId]
    if (!t) return
    if (t.status === 'loading') {
      pendingItems.get(sessionId)?.push(item)
      return
    }
    if (deltaQueue.length) flushDeltas()
    patchTranscript(sessionId, (tr) => upsertInto(tr, item))
  })
  api.on('sessions:delta', (d) => {
    deltaQueue.push(d)
    if (!deltaFrame) deltaFrame = requestAnimationFrame(flushDeltas)
  })
  api.on('sessions:permission', (req) => {
    set((s) => ({
      permissions: { ...s.permissions, [req.sessionId]: mergePerms(s.permissions[req.sessionId] ?? [], [req]) }
    }))
  })
  api.on('sessions:permissionResolved', ({ sessionId, requestId }) => {
    removePermission(sessionId, requestId)
  })
  api.on('app:navigate', ({ sessionId }) => openSession(sessionId))
}

export async function refreshList(): Promise<void> {
  set({ listStatus: 'loading' })
  try {
    const list = await api.invoke('sessions:list', { includeArchived: true })
    set({ sessions: Object.fromEntries(list.map((m) => [m.id, m])), listStatus: 'ready' })
  } catch {
    set({ listStatus: 'error' })
  }
}

function removePermission(sessionId: string, requestId: string): void {
  set((s) => ({
    permissions: { ...s.permissions, [sessionId]: (s.permissions[sessionId] ?? []).filter((p) => p.requestId !== requestId) }
  }))
}

// ---------- actions ----------

export function upsertMeta(meta: SessionMeta): void {
  set((s) => ({ sessions: { ...s.sessions, [meta.id]: meta } }))
}

export function openSession(id: string | null): void {
  const ui = useUi.getState()
  if (ui.view !== 'sessions') ui.setView('sessions')
  if (ui.activeSessionId === id) return
  set({ findOpen: false })
  ui.setActiveSession(id)
  if (id) void loadTranscript(id)
  get().focusComposer()
}

export function goHome(cwd?: string | null): void {
  if (cwd !== undefined) get().setDraft({ cwd, useWorktree: false, baseBranch: '' })
  openSession(null)
}

export function closeActiveSession(): void {
  const id = useUi.getState().activeSessionId
  if (!id) return
  set((s) => ({ closedStack: [...s.closedStack.filter((x) => x !== id), id].slice(-20) }))
  openSession(null)
}

export function reopenClosedSession(): void {
  const stack = [...get().closedStack]
  while (stack.length) {
    const id = stack.pop()!
    if (get().sessions[id]) {
      set({ closedStack: stack })
      openSession(id)
      return
    }
  }
  set({ closedStack: [] })
}

export function sortedSessions(sessions: Record<string, SessionMeta>, archived: boolean): SessionMeta[] {
  return Object.values(sessions)
    .filter((m) => m.archived === archived)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
}

export function cycleSession(dir: 1 | -1): void {
  const list = sortedSessions(get().sessions, false)
  if (!list.length) return
  const cur = useUi.getState().activeSessionId
  const idx = list.findIndex((m) => m.id === cur)
  const next = idx < 0 ? (dir === 1 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length
  openSession(list[next].id)
}

export async function sendMessage(sessionId: string, text: string, attachments: Attachment[] = []): Promise<void> {
  await api.invoke('sessions:send', { sessionId, text, attachments: attachments.length ? attachments : undefined })
}

export async function interrupt(sessionId: string): Promise<void> {
  await api.invoke('sessions:interrupt', sessionId)
}

export async function updateSession(
  sessionId: string,
  patch: Parameters<Invoke['sessions:update']>[0]['patch']
): Promise<void> {
  upsertMeta(await api.invoke('sessions:update', { sessionId, patch }))
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.invoke('sessions:delete', sessionId)
  set((s) => {
    const { [sessionId]: _m, ...sessions } = s.sessions
    return { sessions }
  })
  if (useUi.getState().activeSessionId === sessionId) openSession(null)
}

export async function respondPermission(r: PermissionResponse): Promise<void> {
  removePermission(r.sessionId, r.requestId)
  await api.invoke('sessions:respondPermission', r)
}

export async function loadModels(): Promise<ModelInfo[]> {
  const cached = get().models
  if (cached) return cached
  try {
    const models = await api.invoke('sessions:listModels')
    set({ models })
    return models
  } catch {
    return []
  }
}

interface StartOpts {
  cwd: string | null
  text: string
  attachments?: Attachment[]
  skipTrust?: boolean
  worktree?: { baseBranch?: string }
}

/** Home / Quick Entry flow: trust check → create → activate → send. Returns false when waiting on trust dialog. */
export async function startSession(opts: StartOpts): Promise<boolean> {
  const attachments = opts.attachments ?? []
  if (opts.cwd && !opts.skipTrust) {
    const check = await api.invoke('sessions:checkTrust', opts.cwd)
    if (!check.trusted) {
      set({ pendingStart: { cwd: opts.cwd, text: opts.text, attachments, check, worktree: opts.worktree } })
      return false
    }
  }
  const { draft } = get()
  const meta = await api.invoke('sessions:create', {
    kind: opts.cwd ? 'code' : 'chat',
    cwd: opts.cwd ?? undefined,
    model: draft.model || undefined,
    permissionMode: draft.permissionMode ?? undefined,
    useWorktree: opts.cwd && opts.worktree ? true : undefined,
    baseBranch: opts.cwd && opts.worktree?.baseBranch ? opts.worktree.baseBranch : undefined
  })
  upsertMeta(meta)
  set((s) => ({ transcripts: { ...s.transcripts, [meta.id]: emptyTranscript('ready') } }))
  openSession(meta.id)
  if (opts.text.trim() || attachments.length) await sendMessage(meta.id, opts.text, attachments)
  return true
}

export async function confirmPendingStart(): Promise<void> {
  const p = get().pendingStart
  if (!p) return
  set({ pendingStart: null })
  await api.invoke('sessions:trustFolder', p.cwd)
  await startSession({ cwd: p.cwd, text: p.text, attachments: p.attachments, skipTrust: true, worktree: p.worktree })
}

export function cancelPendingStart(): PendingStart | null {
  const p = get().pendingStart
  set({ pendingStart: null })
  return p
}

export async function newChat(): Promise<void> {
  const meta = await api.invoke('sessions:create', { kind: 'chat' })
  upsertMeta(meta)
  set((s) => ({ transcripts: { ...s.transcripts, [meta.id]: emptyTranscript('ready') } }))
  openSession(meta.id)
}

export async function forkSession(sessionId: string, atItemId?: string): Promise<void> {
  const meta = await api.invoke('sessions:fork', { sessionId, atItemId })
  upsertMeta(meta)
  openSession(meta.id)
}

export async function removeWorktree(sessionId: string): Promise<void> {
  await api.invoke('sessions:removeWorktree', sessionId)
  const meta = await api.invoke('sessions:get', sessionId)
  if (meta) upsertMeta(meta)
}

/** Path to open in an editor / Finder: the worktree if any, else the cwd. */
export function workPath(m: SessionMeta): string | null {
  return m.worktree?.path ?? m.cwd
}

export async function openInEditor(path: string, editorId?: string): Promise<void> {
  await api.invoke('app:openInEditor', { path, editorId: editorId || undefined })
}

/** Reset Home to a new draft (deep links / open folder). */
export function seedHome(opts: { cwd?: string | null }): void {
  if (opts.cwd !== undefined) get().setDraft({ cwd: opts.cwd, useWorktree: false, baseBranch: '' })
  set((s) => ({ homeEpoch: s.homeEpoch + 1 }))
  openSession(null)
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
