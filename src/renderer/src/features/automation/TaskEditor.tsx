import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FolderOpen, X } from 'lucide-react'
import type { ModelInfo, PermissionMode, ScheduledTask, SessionKind } from '@shared/ipc'
import { api } from '@/lib/api'
import { DAYS, PRESETS, defaultDraft, draftToSchedule, formatDateTime, scheduleToDraft, type ScheduleDraft } from './schedule'
import { Button, Field, Segmented, inputCls } from './ui'

const MODES: { id: PermissionMode; label: string }[] = [
  { id: 'acceptEdits', label: 'Accept edits' },
  { id: 'auto', label: 'Auto' },
  { id: 'default', label: 'Ask for permissions' },
  { id: 'plan', label: 'Plan only' },
  { id: 'bypassPermissions', label: 'Bypass permissions' }
]

interface Draft {
  name: string
  prompt: string
  kind: SessionKind
  cwd: string | null
  model: string
  permissionMode: PermissionMode
  useWorktree: boolean
  enabled: boolean
  schedule: ScheduleDraft
}

function initialDraft(task: ScheduledTask | null, defaultCwd: string | null): Draft {
  if (!task) return { name: '', prompt: '', kind: 'code', cwd: defaultCwd, model: '', permissionMode: 'acceptEdits', useWorktree: false, enabled: true, schedule: defaultDraft() }
  return { name: task.name, prompt: task.prompt, kind: task.kind, cwd: task.cwd, model: task.model, permissionMode: task.permissionMode, useWorktree: !!task.useWorktree, enabled: task.enabled, schedule: scheduleToDraft(task.schedule) }
}

function usePreview(d: ScheduleDraft): { next: number[]; error: string | null } {
  const schedule = useMemo(() => draftToSchedule(d), [d])
  const [res, setRes] = useState<{ next: number[]; error: string | null }>({ next: [], error: null })
  useEffect(() => {
    if (schedule.type === 'once') {
      setRes(Number.isFinite(schedule.at) ? { next: [schedule.at], error: schedule.at < Date.now() ? 'This time is in the past' : null } : { next: [], error: 'Pick a date and time' })
      return
    }
    let alive = true
    const t = setTimeout(() => {
      api.invoke('tasks:describeCron', schedule.expr).then((r) => {
        if (alive) setRes(r.valid ? { next: r.next ?? [], error: null } : { next: [], error: r.error ?? 'Invalid cron expression' })
      }, () => undefined)
    }, 200)
    return () => { alive = false; clearTimeout(t) }
  }, [schedule])
  return res
}

function ScheduleFields({ d, onChange }: { d: ScheduleDraft; onChange: (d: ScheduleDraft) => void }) {
  const set = (p: Partial<ScheduleDraft>): void => onChange({ ...d, ...p })
  const preview = usePreview(d)
  return (
    <div className="flex flex-col gap-2.5">
      <Segmented value={d.preset} options={PRESETS} onChange={(preset) => set({ preset })} />
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        {d.preset === 'hourly' && (<>at minute <input type="number" min={0} max={59} value={d.minute} onChange={(e) => set({ minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })} className={`${inputCls} w-20`} /></>)}
        {d.preset === 'weekly' && (<>on <select value={d.day} onChange={(e) => set({ day: Number(e.target.value) })} className={`${inputCls} w-36`}>{DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></>)}
        {(d.preset === 'daily' || d.preset === 'weekdays' || d.preset === 'weekly') && (<>at <input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} className={`${inputCls} w-28`} /></>)}
        {d.preset === 'once' && <input type="datetime-local" value={d.onceAt} onChange={(e) => set({ onceAt: e.target.value })} className={`${inputCls} w-56`} />}
        {d.preset === 'custom' && <input value={d.cron} onChange={(e) => set({ cron: e.target.value })} placeholder="*/30 9-18 * * 1-5" spellCheck={false} className={`${inputCls} font-mono`} />}
      </div>
      <div className="rounded-lg bg-bg-sidebar px-3 py-2 text-[12px]">
        {preview.error ? <span className="text-danger">{preview.error}</span> : (
          <>
            <span className="text-fg-subtle">{preview.next.length > 1 ? 'Next runs: ' : 'Runs: '}</span>
            <span className="text-fg-muted">{preview.next.map(formatDateTime).join(' · ') || '—'}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function TaskEditor({ task, onClose }: { task: ScheduledTask | null; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [draft, setDraft] = useState<Draft>(() => initialDraft(task, null))
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const set = (p: Partial<Draft>): void => setDraft((d) => ({ ...d, ...p }))

  useEffect(() => {
    api.invoke('settings:get').then((s) => {
      setRecent(s.recentFolders)
      if (!task) setDraft((d) => (d.cwd ? d : { ...d, cwd: s.recentFolders[0] ?? null }))
    }, () => undefined)
    api.invoke('sessions:listModels').then(setModels, () => undefined)
  }, [task])

  useEffect(() => {
    if (!draft.cwd || draft.kind !== 'code') { setIsRepo(null); return }
    let alive = true
    api.invoke('git:branches', draft.cwd).then((b) => { if (alive) setIsRepo(b.isRepo) }, () => { if (alive) setIsRepo(false) })
    return () => { alive = false }
  }, [draft.cwd, draft.kind])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing) return
      e.preventDefault(); e.stopPropagation(); onCloseRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const pickFolder = async (): Promise<void> => {
    const p = await api.invoke('app:pickFolder')
    if (p) { set({ cwd: p }); setRecent((r) => [p, ...r.filter((x) => x !== p)]) }
  }

  const save = async (): Promise<void> => {
    setSaving(true); setError(null)
    try {
      await api.invoke('tasks:upsert', {
        ...(task ? { id: task.id, lastRunAt: task.lastRunAt, lastSessionId: task.lastSessionId, lastStatus: task.lastStatus } : {}),
        name: draft.name.trim(),
        prompt: draft.prompt.trim(),
        schedule: draftToSchedule(draft.schedule),
        enabled: draft.enabled,
        kind: draft.kind,
        cwd: draft.kind === 'code' ? draft.cwd : null,
        model: draft.model,
        permissionMode: draft.permissionMode,
        useWorktree: draft.kind === 'code' && isRepo !== false && draft.useWorktree
      })
      onClose()
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSaving(false)
    }
  }

  const canSave = draft.name.trim() && draft.prompt.trim() && (draft.kind === 'chat' || draft.cwd) && !saving
  const folders = draft.cwd && !recent.includes(draft.cwd) ? [draft.cwd, ...recent] : recent
  const risky = draft.permissionMode === 'default' || draft.permissionMode === 'bypassPermissions'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={task ? 'Edit task' : 'New task'}
        className="flex max-h-full w-[min(600px,100%)] flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl outline-none">
        <header className="flex h-14 shrink-0 items-center justify-between px-6">
          <h2 className="text-[15px] font-semibold text-fg">{task ? 'Edit task' : 'New scheduled task'}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-hover hover:text-fg"><X size={16} /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
          <Field label="Name">
            <input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Morning triage" className={inputCls} />
          </Field>
          <Field label="Prompt" hint="Sent as the first message of a new session each time the task runs.">
            <textarea value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} rows={5} placeholder="Review open TODOs in this repo and summarize what changed since yesterday…"
              className="w-full resize-y rounded-lg border border-border bg-bg px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-accent" />
          </Field>

          <Field label="Type">
            <Segmented value={draft.kind} options={[{ id: 'code', label: 'Code' }, { id: 'chat', label: 'Chat' }]} onChange={(kind) => set({ kind })} />
          </Field>

          {draft.kind === 'code' && (
            <Field label="Folder">
              <div className="flex gap-2">
                <select value={draft.cwd ?? ''} onChange={(e) => set({ cwd: e.target.value || null })} className={`${inputCls} min-w-0 flex-1 font-mono text-[12px]`}>
                  {!draft.cwd && <option value="">Choose a folder…</option>}
                  {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <Button onClick={() => void pickFolder()} className="shrink-0 border border-border"><FolderOpen size={14} />Browse…</Button>
              </div>
              {isRepo && (
                <label className="mt-1 flex items-center gap-2 text-[12.5px] text-fg-muted">
                  <input type="checkbox" checked={draft.useWorktree} onChange={(e) => set({ useWorktree: e.target.checked })} className="accent-[var(--color-accent)]" />
                  Run in a new git worktree (keeps your working tree untouched)
                </label>
              )}
            </Field>
          )}

          <Field label="Schedule">
            <ScheduleFields d={draft.schedule} onChange={(schedule) => set({ schedule })} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Model">
              <select value={draft.model} onChange={(e) => set({ model: e.target.value })} className={inputCls}>
                <option value="">Default</option>
                {models.map((m) => <option key={m.value} value={m.value}>{m.displayName}</option>)}
              </select>
            </Field>
            <Field label="Permissions">
              <select value={draft.permissionMode} onChange={(e) => set({ permissionMode: e.target.value as PermissionMode })} className={inputCls}>
                {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
          </div>
          {risky && (
            <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              {draft.permissionMode === 'default'
                ? 'Scheduled tasks run unattended — with "Ask for permissions" the run will stop at the first permission prompt until you answer it. Prefer Accept edits or Auto.'
                : 'Bypass permissions lets the task run any command without asking, while nobody is watching. Prefer Accept edits or Auto.'}
            </div>
          )}

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{saving ? 'Saving…' : task ? 'Save' : 'Create task'}</Button>
        </footer>
      </div>
    </div>
  )
}
