import { useEffect, useState } from 'react'
import { Check, ChevronDown, Code, GitBranch } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errMsg, openInEditor, useSessions } from '../store'
import { anchorAbove, MenuItem, Popover } from '../ui/Popover'
import { Pill } from './Pills'

type Anchor = { x: number; y: number } | null
type Branches = { current: string | null; branches: string[]; isRepo: boolean }

export function WorktreeBadge({ branch, title }: { branch: string; title?: string }) {
  return (
    <span
      title={title ?? `Worktree on ${branch}`}
      className="flex h-6 max-w-48 items-center gap-1 rounded-md bg-bg-hover px-1.5 font-mono text-[11px] text-fg-muted"
    >
      <GitBranch className="size-3 shrink-0" />
      <span className="truncate">{branch}</span>
    </span>
  )
}

/** Home: "Use worktree" toggle + base branch picker, only shown for git repos. */
export function WorktreePill({ cwd }: { cwd: string }) {
  const draft = useSessions((s) => s.draft)
  const setDraft = useSessions((s) => s.setDraft)
  const [info, setInfo] = useState<Branches | null>(null)
  const [anchor, setAnchor] = useState<Anchor>(null)

  useEffect(() => {
    let alive = true
    setInfo(null)
    api
      .invoke('git:branches', cwd)
      .then((b) => alive && setInfo(b))
      .catch(() => alive && setInfo({ current: null, branches: [], isRepo: false }))
    return () => {
      alive = false
    }
  }, [cwd])

  useEffect(() => {
    if (info && !info.isRepo && draft.useWorktree) setDraft({ useWorktree: false, baseBranch: '' })
  }, [info, draft.useWorktree, setDraft])

  if (!info?.isRepo) return null
  const base = draft.baseBranch || info.current || 'HEAD'

  return (
    <>
      <Pill
        icon={<GitBranch className="size-3.5" />}
        className={cn(draft.useWorktree && 'bg-accent/10 text-accent hover:text-accent')}
        title="Run the session in an isolated git worktree"
        onClick={(e) => setAnchor(anchorAbove(e.currentTarget))}
      >
        {draft.useWorktree ? `Worktree · ${base}` : 'Worktree'}
        <ChevronDown className="ml-0.5 inline size-3" />
      </Pill>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="above" className="max-h-80 w-64 overflow-auto">
        <label className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-bg-hover">
          <input
            type="checkbox"
            className="accent-accent"
            checked={draft.useWorktree}
            onChange={(e) => setDraft({ useWorktree: e.target.checked })}
          />
          Use worktree
        </label>
        <div className="my-1 border-t border-border" />
        <div className="px-2.5 pt-0.5 pb-1 text-[11px] font-medium text-fg-subtle">Base branch</div>
        {info.branches.map((b) => (
          <MenuItem
            key={b}
            active={b === base}
            hint={b === base && <Check className="size-3.5" />}
            onClick={() => {
              setDraft({ useWorktree: true, baseBranch: b === info.current ? '' : b })
              setAnchor(null)
            }}
          >
            <span className="font-mono text-[12px]">{b}</span>
            {b === info.current && <span className="ml-1.5 text-xs text-fg-subtle">current</span>}
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}

/** Opens the folder in the preferred editor; chevron menu picks another installed editor. */
export function EditorPill({ path }: { path: string }) {
  const [anchor, setAnchor] = useState<Anchor>(null)
  const [editors, setEditors] = useState<{ id: string; name: string }[] | null>(null)
  const [preferred, setPreferred] = useState('')

  const ensure = async () => {
    const [list, settings] = await Promise.all([
      editors ? Promise.resolve(editors) : api.invoke('app:listEditors').catch(() => []),
      api.invoke('settings:get')
    ])
    setEditors(list)
    setPreferred(settings.preferredEditor)
    return list
  }

  const open = (editorId?: string) => openInEditor(path, editorId).catch((e) => console.error(errMsg(e)))

  return (
    <>
      <span className="flex items-center rounded-lg hover:bg-bg-hover">
        <Pill icon={<Code className="size-3.5" />} title="Open in editor" className="pr-1 hover:bg-transparent" onClick={() => void open()}>
          Open
        </Pill>
        <button
          type="button"
          aria-label="Choose editor"
          onClick={(e) => {
            const a = anchorAbove(e.currentTarget)
            void ensure().then(() => setAnchor(a))
          }}
          className="flex h-7 items-center pr-1.5 text-fg-muted hover:text-fg"
        >
          <ChevronDown className="size-3" />
        </button>
      </span>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="above" className="w-56">
        {editors && editors.length === 0 && <div className="px-2.5 py-1.5 text-xs text-fg-subtle">No editors found</div>}
        {editors?.map((ed) => (
          <MenuItem
            key={ed.id}
            active={ed.id === preferred}
            hint={ed.id === preferred && <Check className="size-3.5" />}
            onClick={() => {
              setAnchor(null)
              setPreferred(ed.id)
              void api.invoke('settings:set', { preferredEditor: ed.id }).catch(() => {})
              void open(ed.id)
            }}
          >
            {ed.name}
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}

/** Small ring showing context window usage; refreshes after each turn result. */
export function ContextMeter({ sessionId }: { sessionId: string }) {
  const lastResultId = useSessions((s) => {
    const t = s.transcripts[sessionId]
    if (!t) return null
    for (let i = t.topIds.length - 1; i >= 0; i--) if (t.items[t.topIds[i]]?.type === 'result') return t.topIds[i]
    return null
  })
  const [usage, setUsage] = useState<{ usedTokens: number; maxTokens: number; percent: number } | null>(null)

  useEffect(() => {
    let alive = true
    api
      .invoke('sessions:contextUsage', sessionId)
      .then((u) => alive && setUsage(u))
      .catch(() => alive && setUsage(null))
    return () => {
      alive = false
    }
  }, [sessionId, lastResultId])

  if (!usage) return null
  const pct = Math.max(0, Math.min(100, usage.percent))
  const r = 6.5
  const c = 2 * Math.PI * r
  const hot = pct > 80
  return (
    <span
      title={`${Math.round(pct)}% of context used (${fmt(usage.usedTokens)} / ${fmt(usage.maxTokens)} tokens)`}
      className="flex size-7 items-center justify-center"
    >
      <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-border" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className={hot ? 'stroke-accent' : 'stroke-fg-subtle'}
        />
      </svg>
    </span>
  )
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)
}
