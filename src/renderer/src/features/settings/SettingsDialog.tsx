// Owner: agent "shell". Settings modal with tabs on the left.
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Blocks, Cpu, Info, Package, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi, type SettingsTab } from '@/stores/ui'
import { McpSettings } from '@/features/mcp/McpSettings'
import { SkillsSettings } from '@/features/mcp/SkillsSettings'
import { ExtensionsSettings } from '@/features/mcp/ExtensionsSettings'
import { useSettings } from './store'
import { GeneralTab } from './tabs/GeneralTab'
import { ModelsTab } from './tabs/ModelsTab'
import { PermissionsTab } from './tabs/PermissionsTab'
import { AboutTab } from './tabs/AboutTab'

const TABS: { id: SettingsTab; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'mcp', label: 'MCP', icon: Blocks },
  { id: 'extensions', label: 'Extensions', icon: Package },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'about', label: 'About', icon: Info }
]

function useActiveCwd(): string | undefined {
  const sessionId = useUi((s) => s.activeSessionId)
  const [cwd, setCwd] = useState<string | undefined>()
  useEffect(() => {
    if (!sessionId) { setCwd(undefined); return }
    let alive = true
    api.invoke('sessions:get', sessionId).then((s) => { if (alive) setCwd(s?.cwd ?? undefined) }, () => {})
    return () => { alive = false }
  }, [sessionId])
  return cwd
}

function TabContent({ tab }: { tab: SettingsTab }) {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const patch = (p: Parameters<typeof update>[0]): void => { void update(p) }
  const cwd = useActiveCwd()

  if (tab === 'mcp') return <McpSettings />
  if (tab === 'extensions') return <ExtensionsSettings />
  if (tab === 'skills') return <SkillsSettings cwd={cwd} />
  if (tab === 'about') return <AboutTab />
  if (!settings) return <div className="text-[13px] text-fg-subtle">Loading…</div>
  if (tab === 'models') return <ModelsTab s={settings} update={patch} />
  if (tab === 'permissions') return <PermissionsTab s={settings} update={patch} />
  return <GeneralTab s={settings} update={patch} />
}

export function SettingsDialog() {
  const { settingsOpen, settingsTab, openSettings, closeSettings } = useUi()

  const panelRef = useRef<HTMLDivElement>(null)

  // Capture phase on window: runs before xterm/composer handlers, which stop Esc propagation.
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing) return
      if ((e.target as HTMLElement | null)?.closest?.('[data-capturing-shortcut]')) return
      e.preventDefault()
      e.stopPropagation()
      closeSettings()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [settingsOpen, closeSettings])

  // Pull focus out of the terminal/composer behind the modal; give it back on close.
  useEffect(() => {
    if (!settingsOpen) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [settingsOpen])

  if (!settingsOpen) return null
  const active = TABS.find((t) => t.id === settingsTab) ?? TABS[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSettings() }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Settings"
        className="flex h-[min(640px,100%)] w-[min(880px,100%)] overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl outline-none">
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-border bg-bg-sidebar p-3">
          <div className="px-2 pt-1 pb-3 text-[13px] font-semibold text-fg">Settings</div>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => openSettings(id)}
              className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                id === active.id ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:bg-bg-hover hover:text-fg')}>
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between px-8">
            <h2 className="text-[15px] font-semibold text-fg">{active.label}</h2>
            <button type="button" aria-label="Close settings" onClick={closeSettings}
              className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-hover hover:text-fg">
              <X size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
            <TabContent tab={active.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
