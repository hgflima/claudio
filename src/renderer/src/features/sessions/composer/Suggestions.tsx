import { useEffect, useMemo, useRef, useState } from 'react'
import { File as FileIcon, Folder, Slash } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { SlashCommand } from '@shared/ipc'

export interface Suggestion { key: string; label: string; detail?: string; insert: string; icon: 'file' | 'dir' | 'command' }

export interface SuggestionState {
  open: boolean
  items: Suggestion[]
  index: number
  start: number
  kind: 'mention' | 'slash' | null
  setIndex: (i: number) => void
  close: () => void
  onKeyDown: (e: React.KeyboardEvent, apply: (insert: string, start: number) => void) => boolean
}

const commandCache = new Map<string, Promise<SlashCommand[]>>()

function commandsFor(sessionId: string): Promise<SlashCommand[]> {
  let p = commandCache.get(sessionId)
  if (!p) {
    p = api.invoke('sessions:listCommands', sessionId).catch(() => {
      commandCache.delete(sessionId)
      return []
    })
    commandCache.set(sessionId, p)
  }
  return p
}

type Trigger = { kind: 'mention' | 'slash'; query: string; start: number } | null

function detect(text: string, caret: number, canMention: boolean, canSlash: boolean): Trigger {
  const before = text.slice(0, caret)
  if (canSlash) {
    const m = /^\/(\S*)$/.exec(before)
    if (m) return { kind: 'slash', query: m[1], start: 0 }
  }
  if (canMention) {
    const m = /(^|\s)@([^\s@]*)$/.exec(before)
    if (m) return { kind: 'mention', query: m[2], start: before.length - m[2].length - 1 }
  }
  return null
}

export function useSuggestions(opts: { text: string; caret: number; cwd: string | null; sessionId?: string }): SuggestionState {
  const { text, caret, cwd, sessionId } = opts
  const trigger = useMemo(() => detect(text, caret, !!cwd, !!sessionId), [text, caret, cwd, sessionId])
  const [items, setItems] = useState<Suggestion[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}` : null
  const reqId = useRef(0)

  useEffect(() => {
    if (dismissed && dismissed !== triggerKey) setDismissed(null)
  }, [triggerKey, dismissed])

  useEffect(() => {
    setIndex(0)
    if (!trigger) {
      setItems([])
      return
    }
    const id = ++reqId.current
    if (trigger.kind === 'slash' && sessionId) {
      void commandsFor(sessionId).then((cmds) => {
        if (id !== reqId.current) return
        const q = trigger.query.toLowerCase()
        const ranked = cmds
          .filter((c) => c.name.toLowerCase().includes(q))
          .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
          .slice(0, 50)
        setItems(
          ranked.map((c) => ({
            key: c.name,
            label: `/${c.name}`,
            detail: c.argumentHint ? `${c.argumentHint} — ${c.description}` : c.description,
            insert: `/${c.name} `,
            icon: 'command'
          }))
        )
      })
      return
    }
    if (trigger.kind === 'mention' && cwd) {
      const t = setTimeout(() => {
        api
          .invoke('files:search', { cwd, query: trigger.query, limit: 30 })
          .then((res) => {
            if (id !== reqId.current) return
            setItems(
              res.map((r) => ({
                key: r.path,
                label: r.path,
                insert: `@${r.path}${r.isDir && !r.path.endsWith('/') ? '/' : ''}${r.isDir ? '' : ' '}`,
                icon: r.isDir ? 'dir' : 'file'
              }))
            )
          })
          .catch(() => id === reqId.current && setItems([]))
      }, 90)
      return () => clearTimeout(t)
    }
  }, [trigger?.kind, trigger?.query, trigger?.start, cwd, sessionId])

  const open = !!trigger && items.length > 0 && dismissed !== triggerKey
  return {
    open,
    items,
    index,
    start: trigger?.start ?? 0,
    kind: trigger?.kind ?? null,
    setIndex,
    close: () => setDismissed(triggerKey),
    onKeyDown(e, apply) {
      if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
        e.preventDefault()
        setIndex((index + 1) % items.length)
        return true
      }
      if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
        e.preventDefault()
        setIndex((index - 1 + items.length) % items.length)
        return true
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        const it = items[index]
        if (it) apply(it.insert, trigger!.start)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(triggerKey)
        return true
      }
      return false
    }
  }
}

export function Suggestions({ state, onPick }: { state: SuggestionState; onPick: (insert: string, start: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${state.index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [state.index])
  return (
    <div
      ref={listRef}
      className="absolute right-0 bottom-full left-0 z-30 mb-2 max-h-72 overflow-auto rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
    >
      {state.items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          data-i={i}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => state.setIndex(i)}
          onClick={() => onPick(it.insert, state.start)}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', i === state.index && 'bg-bg-hover')}
        >
          <span className="shrink-0 text-fg-subtle">
            {it.icon === 'dir' ? <Folder className="size-3.5" /> : it.icon === 'file' ? <FileIcon className="size-3.5" /> : <Slash className="size-3.5" />}
          </span>
          <span className={cn('shrink-0 truncate', it.icon !== 'command' && 'font-mono text-[12.5px]')}>{it.label}</span>
          {it.detail && <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{it.detail}</span>}
        </button>
      ))}
    </div>
  )
}
