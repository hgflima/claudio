// Owner: agent "automation". Scheduled tasks page (main area).
import { useEffect, useState } from 'react'
import { AlarmClock, ChevronDown, ChevronRight, Folder, MessageSquare, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import type { ScheduledTask, TaskRun } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { TaskEditor } from './TaskEditor'
import { describeSchedule, formatDateTime, relativeTime } from './schedule'
import { useNow, useTasks } from './useTasks'
import { Button, Toggle } from './ui'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const STATUS: Record<NonNullable<ScheduledTask['lastStatus']>, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-accent/10 text-accent' },
  success: { label: 'Succeeded', cls: 'bg-success/10 text-success' },
  error: { label: 'Failed', cls: 'bg-danger/10 text-danger' },
  skipped: { label: 'Skipped', cls: 'bg-bg-hover text-fg-muted' }
}

function StatusPill({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status]
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}</span>
}

function folderName(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

function RunHistory({ task }: { task: ScheduledTask }) {
  const [runs, setRuns] = useState<TaskRun[] | null>(null)
  const openSession = useUi((s) => s.setActiveSession)
  useEffect(() => {
    let alive = true
    api.invoke('tasks:runs', task.id).then((r) => { if (alive) setRuns(r) }, () => { if (alive) setRuns([]) })
    return () => { alive = false }
  }, [task.id, task.lastRunAt, task.lastStatus])
  if (!runs) return <p className="px-4 py-3 text-[12px] text-fg-subtle">Loading…</p>
  if (!runs.length) return <p className="px-4 py-3 text-[12px] text-fg-subtle">No runs yet.</p>
  return (
    <ul className="divide-y divide-border">
      {runs.map((r) => (
        <li key={`${r.sessionId}-${r.startedAt}`} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
          <StatusPill status={r.status} />
          <span className="text-fg-muted">{formatDateTime(r.startedAt)}</span>
          {r.finishedAt && <span className="text-fg-subtle">{Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000))}s</span>}
          <div className="flex-1" />
          <button type="button" onClick={() => openSession(r.sessionId)} className="text-accent hover:underline">Open session</button>
        </li>
      ))}
    </ul>
  )
}

function TaskCard({ task, now, onEdit }: { task: ScheduledTask; now: number; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openSession = useUi((s) => s.setActiveSession)

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }

  const toggle = (enabled: boolean): Promise<void> => act(() => api.invoke('tasks:upsert', { ...task, enabled }))
  const runNow = (): Promise<void> => act(async () => { const { sessionId } = await api.invoke('tasks:runNow', task.id); openSession(sessionId) })
  const remove = (): Promise<void> => act(() => api.invoke('tasks:delete', task.id))

  return (
    <li className={cn('rounded-xl border border-border bg-bg-elevated transition-opacity', !task.enabled && 'opacity-70')}>
      <div className="flex items-start gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-medium text-fg">{task.name}</h3>
            {task.lastStatus && <StatusPill status={task.lastStatus} />}
          </div>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            {describeSchedule(task.schedule)}
            {task.enabled && task.nextRunAt
              ? <span className="text-fg-subtle" title={formatDateTime(task.nextRunAt)}> · next {relativeTime(task.nextRunAt, now)}</span>
              : <span className="text-fg-subtle"> · paused</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
            <span className="flex items-center gap-1" title={task.cwd ?? undefined}>
              {task.kind === 'code' && task.cwd ? <><Folder size={12} />{folderName(task.cwd)}</> : <><MessageSquare size={12} />Chat</>}
            </span>
            {task.lastRunAt && (
              <span>
                Last run {relativeTime(task.lastRunAt, now)}
                {task.lastSessionId && <> · <button type="button" onClick={() => openSession(task.lastSessionId!)} className="text-accent hover:underline">open session</button></>}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">{task.prompt}</p>
          {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Toggle checked={task.enabled} onChange={(v) => void toggle(v)} label={task.enabled ? 'Pause task' : 'Enable task'} />
          <Button title="Run now" aria-label="Run now" disabled={busy} onClick={() => void runNow()} className="ml-2 px-2"><Play size={14} /></Button>
          <Button title="Edit" aria-label="Edit" onClick={onEdit} className="px-2"><Pencil size={14} /></Button>
          {confirmDelete
            ? <Button variant="danger" disabled={busy} onClick={() => void remove()} className="px-2 text-[12px]">Delete?</Button>
            : <Button title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(true)} className="px-2"><Trash2 size={14} /></Button>}
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1 border-t border-border px-4 py-1.5 text-[12px] text-fg-subtle hover:text-fg">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Run history
      </button>
      {open && <div className="border-t border-border">{<RunHistory task={task} />}</div>}
    </li>
  )
}

export function TasksView() {
  const { tasks, error } = useTasks()
  const now = useNow()
  const [editing, setEditing] = useState<ScheduledTask | 'new' | null>(null)
  const sorted = tasks ? [...tasks].sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity)) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          <header className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-[26px] text-fg">Scheduled tasks</h1>
              <p className="mt-1 text-[13px] text-fg-muted">Run a prompt automatically in a new session, on a schedule. Claudio needs to be running.</p>
            </div>
            <Button variant="primary" onClick={() => setEditing('new')} className="shrink-0"><Plus size={15} />New task</Button>
          </header>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
          {sorted && sorted.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-8 py-16 text-center">
              <AlarmClock size={30} className="text-fg-subtle" />
              <p className="text-[14px] font-medium text-fg">No scheduled tasks yet</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">Have Claude triage issues every morning, summarize changes weekly, or run a one-off job later. You can also ask Claude in a session to schedule one.</p>
              <Button variant="primary" onClick={() => setEditing('new')} className="mt-2"><Plus size={15} />New task</Button>
            </div>
          )}
          {sorted && sorted.length > 0 && (
            <ul className="flex flex-col gap-3">
              {sorted.map((t) => <TaskCard key={t.id} task={t} now={now} onEdit={() => setEditing(t)} />)}
            </ul>
          )}
        </div>
      </div>
      {editing && <TaskEditor task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
