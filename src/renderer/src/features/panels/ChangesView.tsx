import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, GitBranch, GitCompareArrows, RefreshCw } from 'lucide-react'
import type { GitFileStatus, GitStatus } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DiffView } from './DiffView'
import { EmptyState, PanelToolbar, ToolbarButton } from './PanelChrome'

type FileEntry = GitStatus['files'][number]

const REFRESH_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])

const STATUS_STYLE: Record<GitFileStatus, { label: string; className: string; title: string }> = {
  M: { label: 'M', className: 'text-warning', title: 'Modified' },
  A: { label: 'A', className: 'text-success', title: 'Added' },
  D: { label: 'D', className: 'text-danger', title: 'Deleted' },
  R: { label: 'R', className: 'text-accent', title: 'Renamed' },
  U: { label: 'U', className: 'text-danger', title: 'Conflict' },
  '?': { label: 'U', className: 'text-success', title: 'Untracked' }
}

function splitPath(p: string): { name: string; dir: string } {
  const i = p.lastIndexOf('/')
  return i < 0 ? { name: p, dir: '' } : { name: p.slice(i + 1), dir: p.slice(0, i) }
}

function useGitStatus(sessionId: string, cwd: string) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const s = await api.invoke('git:status', cwd)
      if (my === seq.current) { setStatus(s); setError(null); setTick((t) => t + 1) }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [cwd])

  useEffect(() => { setStatus(null); void refresh() }, [refresh])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const toolIds = new Set<string>()
    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; void refresh() }, 500)
    }
    const offItem = api.on('sessions:item', ({ sessionId: sid, item }) => {
      if (sid !== sessionId) return
      if (item.type === 'tool_use' && REFRESH_TOOLS.has(item.name)) { toolIds.add(item.toolUseId); schedule() }
      else if (item.type === 'tool_result' && toolIds.has(item.toolUseId)) schedule()
      else if (item.type === 'result') schedule()
    })
    const offGit = api.on('git:changed', (p) => { if (p.cwd === cwd) schedule() })
    return () => { offItem(); offGit(); if (timer) clearTimeout(timer) }
  }, [sessionId, cwd, refresh])

  return { status, loading, error, refresh, tick }
}

export function ChangesView({ sessionId, cwd }: { sessionId: string; cwd: string }) {
  const { status, loading, error, refresh, tick } = useGitStatus(sessionId, cwd)
  const [selected, setSelected] = useState<FileEntry | null>(null)

  useEffect(() => { setSelected(null) }, [cwd])

  useEffect(() => {
    if (!selected || !status) return
    const still = status.files.find((f) => f.path === selected.path && f.staged === selected.staged)
    if (!still) setSelected(null)
  }, [status, selected])

  if (selected) {
    return <FileDiff cwd={cwd} file={selected} tick={tick} onBack={() => setSelected(null)} onRefresh={refresh} loading={loading} />
  }

  const totals = status?.files.reduce((a, f) => ({ add: a.add + (f.additions ?? 0), del: a.del + (f.deletions ?? 0) }), { add: 0, del: 0 })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelToolbar>
        {status?.isRepo ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-fg-muted">
            <GitBranch size={13} className="shrink-0" />
            <span className="truncate font-medium text-fg" title={status.branch ?? ''}>{status.branch ?? 'unknown'}</span>
            {!!status.ahead && <span className="flex items-center text-fg-subtle" title={`${status.ahead} ahead`}><ArrowUp size={11} />{status.ahead}</span>}
            {!!status.behind && <span className="flex items-center text-fg-subtle" title={`${status.behind} behind`}><ArrowDown size={11} />{status.behind}</span>}
          </div>
        ) : <div className="flex-1" />}
        <ToolbarButton label="Refresh" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </ToolbarButton>
      </PanelToolbar>

      {error && !status && <EmptyState icon={<GitCompareArrows size={28} />} title="Couldn't read git status">{error}</EmptyState>}
      {!error && !status && <div className="flex-1" />}
      {status && !status.isRepo && (
        <EmptyState icon={<GitCompareArrows size={28} />} title="Not a git repository">
          Changes are tracked with git. Run <code className="rounded bg-code-bg px-1 font-mono">git init</code> in this folder to see them here.
        </EmptyState>
      )}
      {status?.isRepo && status.files.length === 0 && (
        <EmptyState icon={<GitCompareArrows size={28} />} title="No changes">Working tree is clean.</EmptyState>
      )}
      {status?.isRepo && status.files.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            <span>{status.files.length} changed {status.files.length === 1 ? 'file' : 'files'}</span>
            {totals && <span className="font-mono normal-case tracking-normal"><span className="text-success">+{totals.add}</span> <span className="text-danger">−{totals.del}</span></span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {status.files.map((f) => <FileRow key={`${f.staged ? 's' : 'w'}:${f.path}`} file={f} onClick={() => setSelected(f)} />)}
          </ul>
        </>
      )}
    </div>
  )
}

function Stats({ file }: { file: FileEntry }) {
  if (file.additions === undefined && file.deletions === undefined) return null
  return (
    <span className="shrink-0 font-mono text-[11px]">
      {!!file.additions && <span className="text-success">+{file.additions}</span>}
      {!!file.additions && !!file.deletions && ' '}
      {!!file.deletions && <span className="text-danger">−{file.deletions}</span>}
    </span>
  )
}

function FileRow({ file, onClick }: { file: FileEntry; onClick: () => void }) {
  const { name, dir } = splitPath(file.path)
  const st = STATUS_STYLE[file.status]
  return (
    <li>
      <button type="button" onClick={onClick} title={file.path} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-hover">
        <span className={cn('w-3 shrink-0 text-center font-mono text-[11px] font-semibold', st.className)} title={st.title}>{st.label}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className={cn('truncate text-[13px] text-fg', file.status === 'D' && 'line-through decoration-fg-subtle')}>{name}</span>
          {dir && <span className="truncate text-[11px] text-fg-subtle">{dir}</span>}
        </span>
        {file.staged && <span className="shrink-0 rounded border border-border px-1 text-[10px] text-fg-subtle">staged</span>}
        <Stats file={file} />
      </button>
    </li>
  )
}

function FileDiff({ cwd, file, tick, onBack, onRefresh, loading }: { cwd: string; file: FileEntry; tick: number; onBack: () => void; onRefresh: () => void; loading: boolean }) {
  const [patch, setPatch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    api.invoke('git:diff', { cwd, path: file.path, staged: file.staged })
      .then((p) => { if (alive) setPatch(p) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [cwd, file.path, file.staged, tick])

  const { name, dir } = splitPath(file.path)
  const st = STATUS_STYLE[file.status]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelToolbar className="gap-2">
        <ToolbarButton label="Back to changes" onClick={onBack}><ArrowLeft size={14} /></ToolbarButton>
        <span className={cn('font-mono text-[11px] font-semibold', st.className)} title={st.title}>{st.label}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={file.path}>
          <span className="truncate text-[13px] font-medium text-fg">{name}</span>
          {dir && <span className="truncate text-[11px] text-fg-subtle">{dir}</span>}
        </span>
        <Stats file={file} />
        <ToolbarButton label="Refresh" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </ToolbarButton>
      </PanelToolbar>
      <div className="min-h-0 flex-1 overflow-auto bg-bg">
        {error && <p className="px-4 py-6 text-center text-xs text-danger">{error}</p>}
        {!error && patch === null && <p className="px-4 py-6 text-center text-xs text-fg-subtle">Loading diff…</p>}
        {!error && patch !== null && <DiffView patch={patch} />}
      </div>
    </div>
  )
}
