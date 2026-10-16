import { create } from 'zustand'
import { api, type Settings } from '@/lib/api'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await api.invoke('settings:get') }),
  update: async (patch) => set({ settings: await api.invoke('settings:set', patch) })
}))

let subscribed = false
/** Loads settings once and keeps them in sync with main. */
export function initSettingsSync(): () => void {
  if (subscribed) return () => {}
  subscribed = true
  void useSettings.getState().load()
  const off = api.on('settings:changed', (s) => useSettings.setState({ settings: s }))
  return () => { off(); subscribed = false }
}
