// Owner: agent "shell". Draggable 44px title bar with sidebar/panel toggles.
import { useEffect, useState, type ReactNode } from 'react'
import { GitCompareArrows, PanelLeft, Settings, SquareTerminal } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'

function useActiveTitle(sessionId: string | null): string {
  const [title, setTitle] = useState('')
  useEffect(() => {
    if (!sessionId) { setTitle(''); return }
    let alive = true
    void api.invoke('sessions:get', sessionId).then((s) => { if (alive) setTitle(s?.title ?? '') }).catch(() => {})
    const offChanged = api.on('sessions:changed', (s) => { if (s.id === sessionId) setTitle(s.title) })
    const offRemoved = api.on('sessions:removed', ({ sessionId: id }) => { if (id === sessionId) setTitle('') })
    return () => { alive = false; offChanged(); offRemoved() }
  }, [sessionId])
  return title
}

function BarButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick}
      className={cn(
        'no-drag flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg',
        active && 'bg-bg-hover text-fg'
      )}
    >
      {children}
    </button>
  )
}

export function TitleBar() {
  const { view, activeSessionId, sidebarOpen, rightPanel, toggleSidebar, toggleRightPanel, openSettings } = useUi()
  const title = useActiveTitle(activeSessionId)
  const isMac = api.platform === 'darwin'

  return (
    <header
      className="drag relative flex h-11 shrink-0 items-center gap-1 border-b border-border bg-bg-sidebar px-2 select-none"
    >
      {isMac && <div className="w-[70px] shrink-0" />}
      <BarButton label="Toggle sidebar (⌘B)" active={sidebarOpen} onClick={toggleSidebar}>
        <PanelLeft size={16} />
      </BarButton>
      <div className="pointer-events-none absolute inset-x-40 truncate text-center text-[13px] font-medium text-fg-muted">
        {view === 'tasks' ? 'Scheduled tasks' : title || 'Claudio'}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <BarButton label="Terminal (⌃`)" active={rightPanel === 'terminal'} onClick={() => toggleRightPanel('terminal')}>
          <SquareTerminal size={16} />
        </BarButton>
        <BarButton label="Changes (⌘⇧D)" active={rightPanel === 'changes'} onClick={() => toggleRightPanel('changes')}>
          <GitCompareArrows size={16} />
        </BarButton>
        <BarButton label="Settings (⌘,)" onClick={() => openSettings()}>
          <Settings size={16} />
        </BarButton>
      </div>
    </header>
  )
}
