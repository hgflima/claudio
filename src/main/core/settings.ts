// Settings store (owned by orchestrator; shell agent builds the UI on top).
import type { Settings } from '@shared/ipc'
import { EventEmitter } from 'node:events'
import { dataPath, readJson, writeJson } from './store'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  quickEntryShortcut: 'Alt+Space',
  menuBarEnabled: true,
  openAtLogin: false,
  notifications: { permission: 'banner', done: 'banner', error: 'banner' },
  notificationSound: true,
  defaultModel: '',
  defaultPermissionMode: 'default',
  defaultEffort: '',
  trustedFolders: [],
  recentFolders: [],
  alwaysAllow: {},
  sidebarWidth: 280,
  preferredEditor: '',
  keepAwake: true
}

const file = () => dataPath('settings.json')
let cache: Settings | null = null
export const settingsEvents = new EventEmitter() // 'changed' (next: Settings, prev: Settings)

export function getSettings(): Settings {
  if (!cache) {
    const raw = readJson<Partial<Settings>>(file(), {})
    cache = { ...DEFAULT_SETTINGS, ...raw, notifications: { ...DEFAULT_SETTINGS.notifications, ...(raw.notifications ?? {}) } }
  }
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  const prev = getSettings()
  cache = { ...prev, ...patch }
  writeJson(file(), cache)
  settingsEvents.emit('changed', cache, prev)
  return cache
}

export function addRecentFolder(path: string): void {
  const s = getSettings()
  setSettings({ recentFolders: [path, ...s.recentFolders.filter((p) => p !== path)].slice(0, 10) })
}
