import { powerMonitor } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PermissionMode, ScheduledTask, SessionKind, SessionMeta, TaskRun } from '@shared/ipc'
import * as sessions from '../sessions'
import { bus } from '../core/bus'
import { emit } from '../core/ipc'
import { log } from '../core/log'
import { assertDir } from '../workspace/paths'
import { nextFire, parseCron } from './cron'
import { loadRuns, loadTasks, saveRuns, saveTasks } from './store'

const CHECK_MS = 60_000
const CATCH_UP_MS = 60 * 60_000

type CreateAndSend = (opts: {
  kind: SessionKind; cwd: string | null; text: string; title?: string; model?: string; permissionMode?: PermissionMode; useWorktree?: boolean
}) => Promise<SessionMeta>

let tasks: ScheduledTask[] = []
let runs: Record<string, TaskRun[]> = {}
let timer: NodeJS.Timeout | null = null

const permissionModes = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'] as const satisfies readonly PermissionMode[]

export const taskInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(100_000),
  schedule: z.discriminatedUnion('type', [
    z.object({ type: z.literal('cron'), expr: z.string().trim().min(1).max(200) }),
    z.object({ type: z.literal('once'), at: z.number().int().positive() })
  ]),
  enabled: z.boolean(),
  kind: z.enum(['code', 'chat']),
  cwd: z.string().nullable(),
  model: z.string().max(200),
  permissionMode: z.enum(permissionModes),
  useWorktree: z.boolean().optional(),
  lastRunAt: z.number().optional(),
  lastSessionId: z.string().optional(),
  lastStatus: z.enum(['running', 'success', 'error', 'skipped']).optional()
})
export type TaskInput = z.input<typeof taskInputSchema>

function resolveCreateAndSend(): CreateAndSend | null {
  const fn = (sessions as Record<string, unknown>).createAndSend
  return typeof fn === 'function' ? (fn as CreateAndSend) : null
}

function changed(): void {
  saveTasks(tasks)
  emit('tasks:changed', tasks)
  arm()
}

function arm(): void {
  if (timer) clearTimeout(timer)
  const now = Date.now()
  const next = tasks.reduce<number | null>((min, t) => (t.enabled && t.nextRunAt !== null && (min === null || t.nextRunAt < min) ? t.nextRunAt : min), null)
  const delay = next === null ? CHECK_MS : Math.max(0, Math.min(next - now, CHECK_MS))
  timer = setTimeout(tick, delay)
}

function computeNext(t: Pick<ScheduledTask, 'schedule' | 'enabled'>, from: number): number | null {
  return t.enabled ? nextFire(t.schedule, from) : null
}

function tick(): void {
  const now = Date.now()
  const due: ScheduledTask[] = []
  let dirty = false
  for (const t of tasks) {
    if (!t.enabled || t.nextRunAt === null || t.nextRunAt > now) continue
    const late = now - t.nextRunAt
    dirty = true
    if (t.schedule.type === 'once') { t.enabled = false; t.nextRunAt = null } else t.nextRunAt = nextFire(t.schedule, now)
    if (late < CATCH_UP_MS) due.push(t)
    else {
      t.lastStatus = 'skipped'
      log.info(`[automation] skipped "${t.name}" (missed by ${Math.round(late / 60_000)} min)`)
    }
  }
  if (dirty) changed()
  else arm()
  for (const t of due) void fire(t).catch(() => undefined)
}

async function fire(t: ScheduledTask): Promise<{ sessionId: string }> {
  const createAndSend = resolveCreateAndSend()
  const startedAt = Date.now()
  t.lastRunAt = startedAt
  if (!createAndSend) {
    t.lastStatus = 'error'
    changed()
    throw new Error('Sessions module does not support scheduled runs yet (createAndSend missing).')
  }
  try {
    const meta = await createAndSend({
      kind: t.kind,
      cwd: t.kind === 'code' ? t.cwd : null,
      text: t.prompt,
      title: `⏰ ${t.name}`,
      model: t.model || undefined,
      permissionMode: t.permissionMode,
      useWorktree: t.kind === 'code' ? t.useWorktree : undefined
    })
    t.lastSessionId = meta.id
    t.lastStatus = 'running'
    ;(runs[t.id] ??= []).push({ taskId: t.id, sessionId: meta.id, startedAt, status: 'running' })
    saveRuns(runs)
    changed()
    log.info(`[automation] ran "${t.name}" → session ${meta.id}`)
    return { sessionId: meta.id }
  } catch (e) {
    t.lastStatus = 'error'
    changed()
    log.error(`[automation] "${t.name}" failed to start`, e)
    throw e
  }
}

function onTurnFinished({ session, isError }: { session: SessionMeta; isError: boolean }): void {
  let touched = false
  for (const [taskId, list] of Object.entries(runs)) {
    const run = list.find((r) => r.sessionId === session.id && r.status === 'running')
    if (!run) continue
    run.status = isError ? 'error' : 'success'
    run.finishedAt = Date.now()
    touched = true
    const t = tasks.find((x) => x.id === taskId)
    if (t && t.lastSessionId === session.id) t.lastStatus = run.status
  }
  if (touched) { saveRuns(runs); changed() }
}

// ---- public API (IPC + MCP tools) ----

export function listTasks(): ScheduledTask[] {
  return tasks
}

export function getTask(id: string): ScheduledTask | undefined {
  return tasks.find((t) => t.id === id)
}

export async function upsertTask(raw: unknown): Promise<ScheduledTask> {
  const input = taskInputSchema.parse(raw)
  if (input.schedule.type === 'cron') parseCron(input.schedule.expr)
  const cwd = input.kind === 'code' ? await assertDir(input.cwd) : null
  const existing = input.id ? getTask(input.id) : undefined
  if (input.id && !existing) throw new Error(`Task not found: ${input.id}`)
  const base: ScheduledTask = existing ?? { id: randomUUID(), createdAt: Date.now(), nextRunAt: null } as ScheduledTask
  const task: ScheduledTask = {
    ...base,
    name: input.name,
    prompt: input.prompt,
    schedule: input.schedule,
    enabled: input.enabled,
    kind: input.kind,
    cwd,
    model: input.model,
    permissionMode: input.permissionMode,
    useWorktree: input.kind === 'code' ? !!input.useWorktree : false,
    nextRunAt: null
  }
  if (task.schedule.type === 'once' && task.enabled && task.schedule.at <= Date.now() - CATCH_UP_MS) throw new Error('The run time is in the past')
  task.nextRunAt = computeNext(task, Date.now())
  if (existing) tasks = tasks.map((t) => (t.id === task.id ? task : t))
  else tasks = [...tasks, task]
  changed()
  return task
}

export function deleteTask(id: string): void {
  tasks = tasks.filter((t) => t.id !== id)
  delete runs[id]
  saveRuns(runs)
  changed()
}

export function runTaskNow(id: string): Promise<{ sessionId: string }> {
  const t = getTask(id)
  if (!t) return Promise.reject(new Error(`Task not found: ${id}`))
  return fire(t)
}

export function taskRuns(id: string): TaskRun[] {
  return [...(runs[id] ?? [])].reverse()
}

export function startScheduler(): void {
  tasks = loadTasks()
  runs = loadRuns()
  // Runs still "running" from a previous app instance never got their turn-finished event.
  for (const list of Object.values(runs)) for (const r of list) if (r.status === 'running') { r.status = 'error'; r.finishedAt ??= r.startedAt }
  for (const t of tasks) if (t.lastStatus === 'running') t.lastStatus = 'error'
  bus.onBus('session:turn-finished', onTurnFinished)
  powerMonitor.on('resume', () => { log.info('[automation] resume → checking tasks'); tick() })
  tick()
}
