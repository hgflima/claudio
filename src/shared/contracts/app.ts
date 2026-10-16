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
  preferredEditor: string // phase 2: editor id from app:listEditors, '' = auto
  keepAwake: boolean // phase 2: prevent idle sleep while sessions run
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
  | 'open-scheduled-tasks' | 'fork-session' | 'open-in-editor'

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
  'app:listEditors': () => { id: string; name: string }[] // phase 2: installed editors (VS Code, Cursor, Zed, Windsurf, Xcode…)
  'app:openInEditor': (opts: { path: string; editorId?: string }) => void
  /** Store a full HTML document and get an isolated claudio-widget:// URL for a sandboxed iframe. */
  'widget:create': (html: string) => string
  'notify:show': (n: { title: string; body: string; sessionId?: string; kind: 'permission' | 'done' | 'error' }) => void
}

export interface AppEvents {
  'settings:changed': Settings
  'menu:command': MenuCommand
  'app:navigate': { sessionId: string } // e.g. from notification click
  /** Phase 2: deep link (claudio://new?q=&folder=, claudio://session/<id>) or folder opened via Dock/Finder. */
  'app:deepLink': { action: 'new'; q?: string; folder?: string; kind?: 'code' | 'chat' } | { action: 'open-session'; sessionId: string }
}
