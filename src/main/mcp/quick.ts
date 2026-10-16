// Owner: agent "mcp-quick". Quick Entry window + global shortcut (Settings.quickEntryShortcut).
import { app, BrowserWindow, globalShortcut, screen, type Rectangle } from 'electron'
import { z } from 'zod'
import type { Settings } from '@shared/ipc'
import { emitTo, handle } from '../core/ipc'
import { log } from '../core/log'
import { getSettings, settingsEvents } from '../core/settings'
import { dataPath, readJson, writeJson } from '../core/store'
import { loadRenderer, preloadPath, showMainWindow } from '../app/windows'

// The card is drawn by the renderer inside a transparent margin so its CSS shadow is visible.
const WIDTH = 728
const MIN_HEIGHT = 140
const MAX_HEIGHT = 560

let win: BrowserWindow | null = null
let registeredAccelerator: string | null = null
let positioning = false

type ShortcutStatus = { accelerator: string; registered: boolean; error?: 'invalid-accelerator' | 'registration-failed' }
let shortcutStatus: ShortcutStatus = { accelerator: '', registered: false }

type Positions = Record<string, { x: number; y: number }> // display id -> top-left
const positionsFile = () => dataPath('quick-window.json')

const attachmentSchema = z.union([
  z.object({ type: z.literal('image'), mediaType: z.string().regex(/^image\/[\w.+-]+$/), dataBase64: z.string().max(30_000_000), name: z.string().optional() }),
  z.object({ type: z.literal('file'), path: z.string().min(1) })
])
const submitSchema = z.object({
  text: z.string().max(200_000),
  attachments: z.array(attachmentSchema).max(20).optional(),
  cwd: z.string().min(1).nullable()
})

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    type: 'panel', width: WIDTH, height: 220, show: false, frame: false, transparent: true, hasShadow: false,
    resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hiddenInMissionControl: true, backgroundColor: '#00000000',
    webPreferences: { preload: preloadPath(), sandbox: true, contextIsolation: true, nodeIntegration: false, enablePreferredSizeMode: true }
  })
  w.setAlwaysOnTop(true, 'pop-up-menu')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.on('blur', () => hideQuickEntry())
  w.on('moved', () => { if (!positioning) savePosition(w) })
  w.webContents.on('preferred-size-changed', (_e, size) => {
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, size.height))
    const b = w.getBounds()
    if (b.height !== height) { positioning = true; w.setBounds({ ...b, width: WIDTH, height }); positioning = false }
  })
  w.on('closed', () => { win = null })
  loadRenderer(w, 'quick')
  return w
}

function savePosition(w: BrowserWindow): void {
  const b = w.getBounds()
  const display = screen.getDisplayMatching(b)
  const all = readJson<Positions>(positionsFile(), {})
  writeJson(positionsFile(), { ...all, [display.id]: { x: b.x, y: b.y } })
}

function fits(b: Rectangle, area: Rectangle): boolean {
  return b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height
}

function place(w: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const { height } = w.getBounds()
  const saved = readJson<Positions>(positionsFile(), {})[display.id]
  const centered = { x: Math.round(area.x + (area.width - WIDTH) / 2), y: Math.round(area.y + area.height * 0.28) }
  const pos = saved && fits({ ...saved, width: WIDTH, height }, area) ? saved : centered
  positioning = true
  w.setBounds({ x: pos.x, y: pos.y, width: WIDTH, height })
  positioning = false
}

export function hideQuickEntry(): void {
  if (win && !win.isDestroyed() && win.isVisible()) win.hide()
}

export function showQuickEntry(): void {
  win ??= createWindow()
  const w = win
  place(w)
  const reveal = () => {
    w.show()
    w.focus()
    emitTo(w.webContents, 'quick:shown', undefined)
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal)
  else reveal()
}

export function toggleQuickEntry(): void {
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) hideQuickEntry()
  else showQuickEntry()
}

function registerShortcut(accelerator: string): void {
  if (registeredAccelerator) {
    globalShortcut.unregister(registeredAccelerator)
    registeredAccelerator = null
  }
  shortcutStatus = { accelerator, registered: false }
  if (!accelerator) return
  try {
    if (globalShortcut.register(accelerator, toggleQuickEntry)) {
      registeredAccelerator = accelerator
      shortcutStatus = { accelerator, registered: true }
      log.info(`[quick] global shortcut registered: ${accelerator}`)
    } else {
      shortcutStatus = { accelerator, registered: false, error: 'registration-failed' }
      log.warn(`[quick] global shortcut "${accelerator}" is taken by another app`)
    }
  } catch (err) {
    shortcutStatus = { accelerator, registered: false, error: 'invalid-accelerator' }
    log.warn(`[quick] invalid global shortcut "${accelerator}"`, err)
  }
}

function deliverToMain(payload: z.infer<typeof submitSchema>): void {
  const main = showMainWindow()
  // Give the renderer a moment to mount its listeners when the window was just created.
  if (main.webContents.isLoading()) main.webContents.once('did-finish-load', () => setTimeout(() => emitTo(main.webContents, 'quick:submitted', payload), 300))
  else emitTo(main.webContents, 'quick:submitted', payload)
}

export function registerQuickEntry(): void {
  handle('quick:submit', (q) => {
    const payload = submitSchema.parse(q)
    hideQuickEntry()
    deliverToMain(payload)
  })
  handle('quick:dismiss', () => hideQuickEntry())
  handle('quick:getContext', () => ({ recentFolders: getSettings().recentFolders }))
  handle('quick:shortcutStatus', () => shortcutStatus)

  registerShortcut(getSettings().quickEntryShortcut)
  settingsEvents.on('changed', (next: Settings, prev: Settings) => {
    if (next.quickEntryShortcut !== prev.quickEntryShortcut) registerShortcut(next.quickEntryShortcut)
  })
  app.on('will-quit', () => { if (registeredAccelerator) globalShortcut.unregister(registeredAccelerator) })

  win = createWindow() // preload so the first shortcut press is instant
}
