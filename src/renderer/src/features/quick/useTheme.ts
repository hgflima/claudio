import { useEffect } from 'react'
import { api } from '@/lib/api'
import type { ThemeMode } from '@/lib/api'

/** Applies `data-theme` on <html> from Settings.theme, following the OS when set to 'system'. */
export function useTheme(): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let mode: ThemeMode = 'system'
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    void api.invoke('settings:get').then((s) => { mode = s.theme; apply() })
    const off = api.on('settings:changed', (s) => { mode = s.theme; apply() })
    media.addEventListener('change', apply)
    apply()
    return () => { off(); media.removeEventListener('change', apply) }
  }, [])
}
