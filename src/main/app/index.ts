// Owner: agent "shell". Menu, tray, settings/app IPC, notifications, auth status, quit flow.
import { app, dialog, nativeTheme, shell } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute } from 'node:path'
import { z } from 'zod'
import type { AppInfo, Attachment, Settings } from '@shared/ipc'
import { emit, handle } from '../core/ipc'
import { log } from '../core/log'
import { getSettings, setSettings, settingsEvents } from '../core/settings'
import { resolveClaudePath } from '../core/shellEnv'
import { runningSessionsCount } from '../sessions'
import { authStatus, claudeVersion } from './claudeCli'
import { buildMenu } from './menu'
import { registerNotifications, showNotification } from './notifications'
import { syncTray } from './tray'
import { applyTheme, getMainWindow, openExternalSafe, themeBackground } from './windows'

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const level = z.enum(['off', 'banner'])
const settingsPatch = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  quickEntryShortcut: z.string().max(100),
  menuBarEnabled: z.boolean(),
  openAtLogin: z.boolean(),
  notifications: z.object({ permission: level, done: level, error: level }),
  notificationSound: z.boolean(),
  defaultModel: z.string().max(200),
  defaultPermissionMode: z.enum(['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto']),
  defaultEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', '']),
  trustedFolders: z.array(z.string()),
  recentFolders: z.array(z.string()).max(10),
  alwaysAllow: z.record(z.string(), z.array(z.string())),
  sidebarWidth: z.number().min(160).max(800)
}).partial()

const absPath = z.string().min(1).refine(isAbsolute, 'path must be absolute')

function existingPath(p: unknown): string | null {
  const r = absPath.safeParse(p)
  return r.success && existsSync(r.data) ? r.data : null
}

function readAttachment(p: string): Attachment | null {
  const path = existingPath(p)
  if (!path) return null
  const st = statSync(path)
  if (!st.isFile()) return st.isDirectory() ? { type: 'file', path } : null
  const mediaType = IMAGE_TYPES[extname(path).toLowerCase()]
  if (mediaType && st.size <= MAX_IMAGE_BYTES) {
    return { type: 'image', mediaType, dataBase64: readFileSync(path).toString('base64'), name: basename(path) }
  }
  return { type: 'file', path }
}

function onSettingsChanged(next: Settings, prev: Settings): void {
  if (next.theme !== prev.theme) applyTheme()
  if (next.menuBarEnabled !== prev.menuBarEnabled) syncTray()
  if (next.openAtLogin !== prev.openAtLogin) {
    try { app.setLoginItemSettings({ openAtLogin: next.openAtLogin }) } catch (e) { log.warn('[app] setLoginItemSettings failed', String(e)) }
  }
  emit('settings:changed', next)
}

function registerIpc(): void {
  handle('app:getInfo', async () => {
    const info: AppInfo = {
      version: app.getVersion(),
      platform: process.platform,
      claudePath: await resolveClaudePath(),
      claudeVersion: await claudeVersion(),
      userDataPath: app.getPath('userData'),
      logsPath: log.dir()
    }
    return info
  })
  handle('app:getAuthStatus', () => authStatus())
  handle('app:openExternal', (url) => openExternalSafe(String(url)))
  handle('app:showItemInFolder', (p) => { const path = existingPath(p); if (path) shell.showItemInFolder(path) })
  handle('app:openPath', async (p) => { const path = existingPath(p); if (path) await shell.openPath(path) })
  handle('app:pickFolder', async () => {
    const opts = { properties: ['openDirectory', 'createDirectory'] } satisfies Electron.OpenDialogOptions
    const win = getMainWindow()
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  handle('app:pickFiles', async (opts) => {
    const o: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: opts?.images ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] : undefined
    }
    const win = getMainWindow()
    const r = win ? await dialog.showOpenDialog(win, o) : await dialog.showOpenDialog(o)
    return r.canceled ? [] : r.filePaths
  })
  handle('app:readFileAsAttachment', (p) => readAttachment(p))
  handle('settings:get', () => getSettings())
  handle('settings:set', (patch) => setSettings(settingsPatch.parse(patch) as Partial<Settings>))
  handle('notify:show', (n) => showNotification(z.object({
    title: z.string(), body: z.string(), sessionId: z.string().optional(), kind: z.enum(['permission', 'done', 'error'])
  }).parse(n)))
}

function registerQuitFlow(): void {
  let confirmed = false
  app.on('before-quit', (e) => {
    if (confirmed) return
    const n = runningSessionsCount()
    if (n <= 0) return
    e.preventDefault()
    const opts: Electron.MessageBoxSyncOptions = {
      type: 'warning', buttons: ['Quit', 'Cancel'], defaultId: 1, cancelId: 1,
      message: `Claudio is working in ${n} session${n === 1 ? '' : 's'}. Quit anyway?`,
      detail: 'Running sessions will be interrupted.'
    }
    const win = getMainWindow()
    const choice = win ? dialog.showMessageBoxSync(win, opts) : dialog.showMessageBoxSync(opts)
    if (choice === 0) { confirmed = true; app.quit() }
  })
}

export function registerApp(): void {
  nativeTheme.themeSource = getSettings().theme
  nativeTheme.on('updated', () => getMainWindow()?.setBackgroundColor(themeBackground()))
  settingsEvents.on('changed', onSettingsChanged)
  registerIpc()
  buildMenu()
  syncTray()
  registerNotifications()
  registerQuitFlow()
}
