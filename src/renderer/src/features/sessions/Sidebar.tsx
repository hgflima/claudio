import { useEffect, useMemo, useState } from 'react'
import { Archive, Download, LoaderCircle, MessageSquarePlus, Search, SquarePen, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api } from '@/lib/api'
import { useUi } from '@/stores/ui'
import { goHome, initSessions, newChat, sortedSessions, useSessions } from './store'
import { groupSessions } from './util'
import { SessionRow } from './sidebar/SessionRow'
import { ImportCliDialog } from './sidebar/ImportCliDialog'

type SearchHit = { sessionId: string; snippet: string; lastActivityAt: number }

export function Sidebar() {
  useEffect(initSessions, [])
  const sessions = useSessions((s) => s.sessions)
  const listStatus = useSessions((s) => s.listStatus)
  const showArchived = useSessions((s) => s.showArchived)
  const setShowArchived = useSessions((s) => s.setShowArchived)
  const activeId = useUi((s) => s.activeSessionId)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const t = setTimeout(() => {
      api
        .invoke('sessions:search', q)
        .then((r) => !cancelled && setHits(r))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const groups = useMemo(() => groupSessions(sortedSessions(sessions, showArchived)), [sessions, showArchived])

  const searchResults = useMemo(() => {
    if (!hits) return null
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    const out: { id: string; snippet?: string }[] = []
    for (const m of sortedSessions(sessions, false).concat(sortedSessions(sessions, true))) {
      if (m.title.toLowerCase().includes(q)) {
        seen.add(m.id)
        out.push({ id: m.id })
      }
    }
    for (const h of hits) {
      if (seen.has(h.sessionId) || !sessions[h.sessionId]) continue
      seen.add(h.sessionId)
      out.push({ id: h.sessionId, snippet: h.snippet })
    }
    return out
  }, [hits, sessions, query])

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-bg-sidebar">
      <div className="flex flex-col gap-0.5 px-2 pt-2">
        <NavButton icon={<SquarePen className="size-4" />} label="New session" onClick={() => goHome()} />
        <NavButton icon={<MessageSquarePlus className="size-4" />} label="New chat" onClick={() => void newChat()} />
      </div>

      <div className="px-2 pt-2 pb-1">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-transparent bg-bg-hover/60 px-2.5 focus-within:border-border focus-within:bg-bg-elevated">
          <Search className="size-3.5 shrink-0 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search sessions"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
          />
          {searching && <LoaderCircle className="size-3.5 animate-spin text-fg-subtle" />}
          {query && !searching && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-fg-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {searchResults ? (
          <Section label="Results">
            {searchResults.length === 0 && <Empty>No matches</Empty>}
            {searchResults.map((r) => (
              <SessionRow key={r.id} session={sessions[r.id]} active={r.id === activeId} snippet={r.snippet} />
            ))}
          </Section>
        ) : listStatus !== 'ready' && !Object.keys(sessions).length ? (
          listStatus === 'error' ? <Empty>Couldn’t load sessions</Empty> : <ListSkeleton />
        ) : groups.length === 0 ? (
          <Empty>{showArchived ? 'No archived sessions' : 'No sessions yet'}</Empty>
        ) : (
          groups.map((g) => (
            <Section key={g.group} label={g.group}>
              {g.sessions.map((s) => (
                <SessionRow key={s.id} session={s} active={s.id === activeId} />
              ))}
            </Section>
          ))
        )}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border px-2 py-2">
        <NavButton
          icon={<Archive className="size-4" />}
          label={showArchived ? 'Back to sessions' : 'Archived'}
          active={showArchived}
          onClick={() => setShowArchived(!showArchived)}
        />
        <NavButton icon={<Download className="size-4" />} label="Import from Claude Code CLI…" onClick={() => setImportOpen(true)} />
      </div>

      <ImportCliDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </aside>
  )
}

function NavButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg',
        active && 'bg-bg-hover text-fg'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-fg-subtle">{label}</div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 py-6 text-center text-xs text-fg-subtle">{children}</div>
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2.5 pt-5">
      {[70, 55, 80, 45, 65].map((w, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-3 animate-pulse rounded bg-bg-hover" style={{ width: `${w}%` }} />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg-hover/70" />
        </div>
      ))}
    </div>
  )
}
