// Owner: agent "shell". App-level info, settings, dialogs, notifications, menu commands.
import type { PermissionMode } from './sessions'

export type ThemeMode = 'system' | 'light' | 'dark'
export type NotifyLevel = 'off' | 'banner'

export interface Settings {
  theme: ThemeMode
  quickEntryShortcut: string // Electron accelerator, '' = disabled. Default 'Alt+Space'
  menuBarEnabled: boolean
  openAtLogin: boolean
  notifications: { permission: NotifyLevel; done: NotifyLevel; error: NotifyLevel }
  notificationSound: boolean
  defaultModel: string // '' = SDK default
  defaultPermissionMode: PermissionMode
  defaultEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | ''
  trustedFolders: string[]
  recentFolders: string[] // most recent first, max 10
  alwaysAllow: Record<string, string[]> // cwd -> tool rules allowed forever (e.g. "Bash(npm test)", "Edit")
  sidebarWidth: number
}

export interface AppInfo {
  version: string
  platform: string
  claudePath: string | null
  claudeVersion: string | null
  userDataPath: string
  logsPath: string
}

export interface AuthStatus {
  loggedIn: boolean
  method?: 'subscription' | 'api-key' | 'unknown'
  email?: string
  subscriptionType?: string // e.g. 'max', 'pro'
  error?: string
}

export type MenuCommand =
  | 'new-session' | 'new-chat' | 'open-folder' | 'close-session' | 'reopen-closed-session'
  | 'next-session' | 'prev-session' | 'toggle-sidebar' | 'toggle-terminal' | 'toggle-changes'
  | 'open-settings' | 'command-palette' | 'find' | 'focus-composer' | 'interrupt'

export interface AppInvoke {
  'app:getInfo': () => AppInfo
  'app:getAuthStatus': () => AuthStatus
  'app:openExternal': (url: string) => void
  'app:showItemInFolder': (path: string) => void
  'app:openPath': (path: string) => void
  'app:pickFolder': () => string | null
  'app:pickFiles': (opts?: { images?: boolean }) => string[]
  'app:readFileAsAttachment': (path: string) => import('./sessions').Attachment | null
  'settings:get': () => Settings
  'settings:set': (patch: Partial<Settings>) => Settings
  'notify:show': (n: { title: string; body: string; sessionId?: string; kind: 'permission' | 'done' | 'error' }) => void
}

export interface AppEvents {
  'settings:changed': Settings
  'menu:command': MenuCommand
  'app:navigate': { sessionId: string } // e.g. from notification click
}
