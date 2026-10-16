import { useEffect, useRef, useSyncExternalStore } from 'react'
import { RotateCcw, Eraser } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { getTerminal, restartTerminal, startPty, subscribeTerminals, type TermHandle } from './terminals'
import { PanelToolbar, ToolbarButton } from './PanelChrome'

export function TerminalView({ sessionId, cwd }: { sessionId: string; cwd: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<TermHandle | null>(null)
  useSyncExternalStore(subscribeTerminals, () => handleRef.current?.ptyId ?? handleRef.current?.exited)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const h = getTerminal(sessionId, cwd)
    handleRef.current = h
    host.appendChild(h.el)
    if (!h.term.element) h.term.open(h.el)

    const fit = (): void => {
      if (host.offsetWidth === 0 || host.offsetHeight === 0) return
      try { h.fit.fit() } catch { /* not rendered yet */ }
    }
    fit()
    if (!h.ptyId && !h.exited) void startPty(h)
    const raf = requestAnimationFrame(() => { fit(); h.term.focus() })
    const ro = new ResizeObserver(() => fit())
    ro.observe(host)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (h.el.parentElement === host) host.removeChild(h.el)
    }
  }, [sessionId, cwd])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelToolbar>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle" title={cwd}>{cwd}</span>
        <ToolbarButton label="Clear" onClick={() => handleRef.current?.term.clear()}><Eraser size={14} /></ToolbarButton>
        <ToolbarButton label="Restart terminal" onClick={() => { const h = handleRef.current; if (h) void restartTerminal(h).then(() => h.term.focus()) }}>
          <RotateCcw size={14} />
        </ToolbarButton>
      </PanelToolbar>
      <div className="min-h-0 flex-1 overflow-hidden py-2 pl-3 pr-1" onMouseDown={() => handleRef.current?.term.focus()}>
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  )
}
