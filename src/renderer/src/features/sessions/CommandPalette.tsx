import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Fuse from 'fuse.js'
import {
  Archive, Clock, Code, Folder, FolderOpen, GitFork, MessageCircle, MessageSquarePlus, Monitor, Moon, PanelLeft,
  PanelRight, Search, Settings, SquarePen, Sun, Terminal
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { commands } from '@/stores/commands'
import { useUi } from '@/stores/ui'
import type { SessionMeta } from '@shared/ipc'
import { useSessionsEffects } from './effects'
import { goHome, newChat, openSession, sortedSessions, useSessions, workPath } from './store'
import { basename, relativeTime, tildify } from './util'

type Group = 'Actions' | 'Sessions' | 'Folders'
interface Entry {
  id: string
  group: Group
  title: string
  subtitle?: string
  keywords?: string
  icon: ReactNode
  hint?: string
  run: () => void
}

const GROUPS: Group[] = ['Actions', 'Sessions', 'Folders']
const ic = 'size-4'

function buildActions(active: SessionMeta | undefined, hasDraftCwd: boolean): Entry[] {
  const ui = useUi.getState()
  const theme = (theme: 'light' | 'dark' | 'system') => () => void api.invoke('settings:set', { theme }).catch(() => {})
  const list: (Entry | false)[] = [
    { id: 'new-session', group: 'Actions', title: 'New session', icon: <SquarePen className={ic} />, hint: '⌘N', run: () => goHome() },
    { id: 'new-chat', group: 'Actions', title: 'New chat', icon: <MessageSquarePlus className={ic} />, run: () => void newChat() },
    {
      id: 'open-folder', group: 'Actions', title: 'Open folder…', icon: <FolderOpen className={ic} />, hint: '⌘⇧O',
      run: () => void api.invoke('app:pickFolder').then((p) => p && goHome(p))
    },
    { id: 'settings', group: 'Actions', title: 'Settings', icon: <Settings className={ic} />, hint: '⌘,', run: () => ui.openSettings() },
    { id: 'tasks', group: 'Actions', title: 'Scheduled tasks', keywords: 'cron schedule automation', icon: <Clock className={ic} />, run: () => ui.setView('tasks') },
    { id: 'terminal', group: 'Actions', title: 'Toggle terminal', icon: <Terminal className={ic} />, run: () => ui.toggleRightPanel('terminal') },
    { id: 'changes', group: 'Actions', title: 'Toggle changes', keywords: 'diff git', icon: <PanelRight className={ic} />, run: () => ui.toggleRightPanel('changes') },
    { id: 'sidebar', group: 'Actions', title: 'Toggle sidebar', icon: <PanelLeft className={ic} />, hint: '⌘B', run: () => ui.toggleSidebar() },
    !!active && { id: 'find', group: 'Actions', title: 'Find in conversation', icon: <Search className={ic} />, hint: '⌘F', run: () => commands.publish('find') },
    !!active && { id: 'fork', group: 'Actions', title: 'Fork session', icon: <GitFork className={ic} />, run: () => commands.publish('fork-session') },
    (active ? !!workPath(active) : hasDraftCwd) && {
      id: 'editor', group: 'Actions', title: 'Open in editor', keywords: 'vscode cursor zed', icon: <Code className={ic} />,
      run: () => commands.publish('open-in-editor')
    },
    { id: 'theme-light', group: 'Actions', title: 'Theme: Light', keywords: 'appearance', icon: <Sun className={ic} />, run: theme('light') },
    { id: 'theme-dark', group: 'Actions', title: 'Theme: Dark', keywords: 'appearance', icon: <Moon className={ic} />, run: theme('dark') },
    { id: 'theme-system', group: 'Actions', title: 'Theme: System', keywords: 'appearance auto', icon: <Monitor className={ic} />, run: theme('system') }
  ]
  return list.filter((e): e is Entry => !!e)
}

// Fallback when the app menu doesn't capture ⌘K / Ctrl+K (the accelerator normally swallows the keydown).
function usePaletteShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const ui = useUi.getState()
        ui.setPaletteOpen(!ui.paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function CommandPalette() {
  useSessionsEffects()
  usePaletteShortcut()
  const open = useUi((s) => s.paletteOpen)
  if (!open) return null
  return <Palette />
}

function Palette() {
  const setOpen = useUi((s) => s.setPaletteOpen)
  const activeId = useUi((s) => s.activeSessionId)
  const sessions = useSessions((s) => s.sessions)
  const draftCwd = useSessions((s) => s.draft.cwd)
  const [folders, setFolders] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.invoke('settings:get').then((s) => setFolders(s.recentFolders)).catch(() => {})
  }, [])

  const entries = useMemo<Entry[]>(() => {
    const active = activeId ? sessions[activeId] : undefined
    const sessionEntries: Entry[] = [...sortedSessions(sessions, false), ...sortedSessions(sessions, true)].map((m) => ({
      id: `s:${m.id}`,
      group: 'Sessions',
      title: m.title || 'Untitled',
      subtitle: [m.cwd ? basename(m.worktree?.originCwd ?? m.cwd) : 'Chat', m.archived && 'archived', relativeTime(m.lastActivityAt)]
        .filter(Boolean)
        .join(' · '),
      keywords: m.cwd ?? '',
      icon: m.archived ? <Archive className={ic} /> : m.cwd ? <Folder className={ic} /> : <MessageCircle className={ic} />,
      run: () => openSession(m.id)
    }))
    const folderEntries: Entry[] = folders.map((f) => ({
      id: `f:${f}`,
      group: 'Folders',
      title: basename(f),
      subtitle: tildify(f),
      keywords: f,
      icon: <FolderOpen className={ic} />,
      run: () => goHome(f)
    }))
    return [...buildActions(active, !!draftCwd), ...sessionEntries, ...folderEntries]
  }, [sessions, folders, activeId, draftCwd])

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [{ name: 'title', weight: 3 }, { name: 'subtitle', weight: 1 }, { name: 'keywords', weight: 1 }],
        threshold: 0.38,
        ignoreLocation: true
      }),
    [entries]
  )

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) {
      const counts: Record<Group, number> = { Actions: 0, Sessions: 0, Folders: 0 }
      const limit: Record<Group, number> = { Actions: 8, Sessions: 6, Folders: 4 }
      return entries.filter((e) => counts[e.group]++ < limit[e.group])
    }
    const hits = fuse.search(q, { limit: 40 }).map((r) => r.item)
    return GROUPS.flatMap((g) => hits.filter((h) => h.group === g))
  }, [query, entries, fuse])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const close = () => setOpen(false)
  const run = (e: Entry | undefined) => {
    if (!e) return
    close()
    e.run()
  }

  return (
    <div className="no-drag fixed inset-0 z-[60] bg-black/15" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="mx-auto mt-[12vh] flex max-h-[60vh] w-[min(620px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(results[index])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
            onBlur={(e) => {
              if (!e.relatedTarget) e.currentTarget.focus()
            }}
            placeholder="Search actions, sessions and folders"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div ref={listRef} className="min-h-0 overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-8 text-center text-sm text-fg-subtle">No results</div>}
          {results.map((e, i) => (
            <div key={e.id}>
              {(i === 0 || results[i - 1].group !== e.group) && (
                <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-fg-subtle">{e.group}</div>
              )}
              <button
                type="button"
                data-i={i}
                onMouseMove={() => index !== i && setIndex(i)}
                onClick={() => run(e)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === index && 'bg-bg-hover')}
              >
                <span className="shrink-0 text-fg-muted">{e.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{e.title}</span>
                {e.subtitle && <span className="max-w-[45%] shrink truncate text-xs text-fg-subtle">{e.subtitle}</span>}
                {e.hint && <kbd className="shrink-0 font-sans text-[11px] text-fg-subtle">{e.hint}</kbd>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
