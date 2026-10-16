// Owner: agent "panels". Resizable right panel with Terminal / Changes tabs.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { FolderX, GitCompareArrows, SquareTerminal, X } from 'lucide-react'
import { useUi, type RightPanel as PanelTab } from '@/stores/ui'
import { cn } from '@/lib/cn'
import { useSessionCwd } from './useSessionCwd'
import { TerminalView } from './TerminalView'
import { ChangesView } from './ChangesView'
import { EmptyState } from './PanelChrome'

const MIN_W = 320
const MAX_W = 900
const DEFAULT_W = 440
const WIDTH_KEY = 'claudio.rightPanel.width'

function loadWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    if (n >= MIN_W && n <= MAX_W) return n
  } catch { /* storage unavailable */ }
  return DEFAULT_W
}

function useResizableWidth() {
  const [width, setWidth] = useState(loadWidth)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: width }
    setDragging(true)
  }, [width])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const max = Math.min(MAX_W, window.innerWidth - 360)
    setWidth(Math.round(Math.max(MIN_W, Math.min(Math.max(MIN_W, max), start.current.w + start.current.x - e.clientX))))
  }, [])

  const onPointerUp = useCallback(() => {
    start.current = null
    setDragging(false)
  }, [])

  useEffect(() => {
    if (dragging) return
    try { localStorage.setItem(WIDTH_KEY, String(width)) } catch { /* storage unavailable */ }
  }, [dragging, width])

  return { width, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

const TABS: { id: Exclude<PanelTab, null>; label: string; icon: typeof SquareTerminal }[] = [
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'changes', label: 'Changes', icon: GitCompareArrows }
]

export function RightPanel() {
  const rightPanel = useUi((s) => s.rightPanel)
  const setRightPanel = useUi((s) => s.setRightPanel)
  const sessionId = useUi((s) => s.activeSessionId)
  const { cwd, loading } = useSessionCwd(sessionId)
  const { width, dragging, handlers } = useResizableWidth()

  if (!rightPanel) return null

  return (
    <aside style={{ width }} className="relative flex shrink-0 flex-col border-l border-border bg-bg">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        {...handlers}
        className={cn('absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize', dragging && 'bg-accent/20')}
      />
      {dragging && <div className="fixed inset-0 z-20 cursor-col-resize" />}

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRightPanel(id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors',
              rightPanel === id ? 'bg-bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-bg-hover/60 hover:text-fg'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" title="Close panel" aria-label="Close panel" onClick={() => setRightPanel(null)} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg">
          <X size={15} />
        </button>
      </div>

      {!sessionId || (!cwd && !loading) ? (
        <EmptyState icon={<FolderX size={28} />} title={sessionId ? 'No working folder' : 'No session selected'}>
          {sessionId
            ? 'This conversation isn’t attached to a folder. Start a Code session in a folder to use the terminal and see changes.'
            : 'Open a Code session to use the terminal and review changes in its folder.'}
        </EmptyState>
      ) : !cwd ? (
        <div className="flex-1" />
      ) : rightPanel === 'terminal' ? (
        <TerminalView sessionId={sessionId} cwd={cwd} />
      ) : (
        <ChangesView sessionId={sessionId} cwd={cwd} />
      )}
    </aside>
  )
}
