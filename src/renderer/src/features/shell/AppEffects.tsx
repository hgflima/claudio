// Owner: agent "shell". Global side effects: theme, menu commands, navigation from notifications.
import { useEffect } from 'react'
import { api, type MenuCommand, type ThemeMode } from '@/lib/api'
import { commands } from '@/stores/commands'
import { useUi } from '@/stores/ui'
import { initSettingsSync, useSettings } from '../settings/store'

function resolveTheme(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
}

function useTheme(): void {
  const mode = useSettings((s) => s.settings?.theme ?? 'system')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => { document.documentElement.dataset.theme = resolveTheme(mode, mq.matches) }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])
}

function handleLocally(cmd: MenuCommand): void {
  const ui = useUi.getState()
  if (cmd === 'toggle-sidebar') ui.toggleSidebar()
  else if (cmd === 'toggle-terminal') ui.toggleRightPanel('terminal')
  else if (cmd === 'toggle-changes') ui.toggleRightPanel('changes')
  else if (cmd === 'open-settings') ui.openSettings()
}

export function AppEffects() {
  useTheme()
  useEffect(() => initSettingsSync(), [])
  useEffect(() => api.on('menu:command', (cmd) => { handleLocally(cmd); commands.publish(cmd) }), [])
  useEffect(() => api.on('app:navigate', ({ sessionId }) => useUi.getState().setActiveSession(sessionId)), [])
  return null
}
