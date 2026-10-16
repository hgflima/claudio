import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { commands } from '@/stores/commands'
import { useSessions } from '../store'

const ALL = 'cl-find'
const CURRENT = 'cl-find-current'

function clearHighlights(): void {
  CSS.highlights?.delete(ALL)
  CSS.highlights?.delete(CURRENT)
}

function findRanges(root: Element, query: string): Range[] {
  const q = query.toLowerCase()
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').toLowerCase()
    let i = text.indexOf(q)
    while (i !== -1 && ranges.length < 2000) {
      const r = document.createRange()
      r.setStart(node, i)
      r.setEnd(node, i + q.length)
      ranges.push(r)
      i = text.indexOf(q, i + q.length)
    }
  }
  return ranges
}

function scrollToRange(range: Range, sessionId: string): void {
  const scroller = document.querySelector<HTMLElement>(`[data-transcript-scroll="${sessionId}"]`)
  if (!scroller) return
  const rect = range.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  if (rect.top < box.top + 48 || rect.bottom > box.bottom - 24) {
    scroller.scrollTop += rect.top - box.top - box.height / 3
  }
}

export function FindBar({ sessionId }: { sessionId: string }) {
  const setFindOpen = useSessions((s) => s.setFindOpen)
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const ranges = useRef<Range[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const paint = useCallback(
    (i: number, scroll: boolean) => {
      const list = ranges.current
      if (!CSS.highlights) return
      if (!list.length) {
        clearHighlights()
        return
      }
      CSS.highlights.set(ALL, new Highlight(...list))
      CSS.highlights.set(CURRENT, new Highlight(list[i]))
      if (scroll) scrollToRange(list[i], sessionId)
    },
    [sessionId]
  )

  const recompute = useCallback(
    (scroll: boolean) => {
      const root = document.querySelector(`[data-transcript-content="${sessionId}"]`)
      ranges.current = root && query ? findRanges(root, query) : []
      const n = ranges.current.length
      setCount(n)
      setIndex((prev) => {
        const next = scroll ? 0 : Math.min(prev, Math.max(0, n - 1))
        paint(next, scroll)
        return next
      })
    },
    [query, sessionId, paint]
  )

  useEffect(() => {
    const t = setTimeout(() => recompute(true), 120)
    return () => clearTimeout(t)
  }, [recompute])

  // Re-run as the transcript streams or cards expand, without jumping the scroll.
  useEffect(() => {
    const root = document.querySelector(`[data-transcript-content="${sessionId}"]`)
    if (!root || !query) return
    let t = 0
    const mo = new MutationObserver(() => {
      clearTimeout(t)
      t = window.setTimeout(() => recompute(false), 300)
    })
    mo.observe(root, { subtree: true, childList: true, characterData: true })
    return () => {
      clearTimeout(t)
      mo.disconnect()
    }
  }, [sessionId, query, recompute])

  useEffect(() => clearHighlights, [])

  useEffect(() => {
    inputRef.current?.focus()
    return commands.subscribe((cmd) => {
      if (cmd === 'find') inputRef.current?.select()
    })
  }, [])

  const step = (dir: 1 | -1) => {
    const n = ranges.current.length
    if (!n) return
    const next = (index + dir + n) % n
    setIndex(next)
    paint(next, true)
  }

  return (
    <div className="absolute top-2 right-4 z-20 flex items-center gap-1 rounded-xl border border-border bg-bg-elevated py-1 pr-1 pl-3 shadow-md">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setFindOpen(false)
          }
        }}
        placeholder="Find in conversation"
        className="w-52 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
      />
      <span className="min-w-12 text-right text-xs text-fg-subtle tabular-nums">
        {query ? (count ? `${index + 1}/${count}` : '0/0') : ''}
      </span>
      <IconBtn label="Previous (⇧↵)" onClick={() => step(-1)}>
        <ChevronUp className="size-3.5" />
      </IconBtn>
      <IconBtn label="Next (↵)" onClick={() => step(1)}>
        <ChevronDown className="size-3.5" />
      </IconBtn>
      <IconBtn label="Close (Esc)" onClick={() => setFindOpen(false)}>
        <X className="size-3.5" />
      </IconBtn>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {children}
    </button>
  )
}
