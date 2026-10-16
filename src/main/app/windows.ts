// Owner: agent "shell". Main window lifecycle: bounds persistence, theme, navigation guards.
import { BrowserWindow, nativeTheme, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getSettings } from '../core/settings'
import { dataPath, readJson, writeJson } from '../core/store'

const BG_LIGHT = '#faf9f5'
const BG_DARK = '#262624'
const DEFAULT_SIZE = { width: 1280, height: 820 }

interface WindowState { x?: number; y?: number; width: number; height: number; maximized?: boolean; fullscreen?: boolean }

let mainWindow: BrowserWindow | null = null

export function preloadPath(): string { return join(__dirname, '../preload/index.cjs') }

export function loadRenderer(win: BrowserWindow, page: 'index' | 'quick'): void {
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export function getMainWindow(): BrowserWindow | null { return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null }

export function themeBackground(): string { return nativeTheme.shouldUseDarkColors ? BG_DARK : BG_LIGHT }

/** Sync nativeTheme with settings.theme and repaint window backgrounds. */
export function applyTheme(): void {
  nativeTheme.themeSource = getSettings().theme
  getMainWindow()?.setBackgroundColor(themeBackground())
}

/** True if the URL belongs to the app's own renderer (dev server or bundled files). */
export function isAppUrl(url: string): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) {
    try { return new URL(url).origin === new URL(dev).origin } catch { return false }
  }
  return url.startsWith(pathToFileURL(join(__dirname, '../renderer')).href)
}

export function openExternalSafe(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') void shell.openExternal(url)
  } catch { /* invalid url */ }
}

const stateFile = () => dataPath('window-state.json')

function isVisibleOnSomeDisplay(b: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: d }) =>
    b.x < d.x + d.width && b.x + b.width > d.x && b.y < d.y + d.height && b.y + b.height > d.y)
}

function loadState(): WindowState {
  const s = readJson<WindowState>(stateFile(), DEFAULT_SIZE)
  const width = Math.max(720, Number(s.width) || DEFAULT_SIZE.width)
  const height = Math.max(480, Number(s.height) || DEFAULT_SIZE.height)
  if (typeof s.x === 'number' && typeof s.y === 'number' && isVisibleOnSomeDisplay({ x: s.x, y: s.y, width, height })) {
    return { x: s.x, y: s.y, width, height, maximized: !!s.maximized, fullscreen: !!s.fullscreen }
  }
  return { width, height, maximized: !!s.maximized }
}

function trackState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (win.isDestroyed()) return
    const b = win.getNormalBounds()
    writeJson(stateFile(), { ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() } satisfies WindowState)
  }
  const schedule = (): void => { if (timer) clearTimeout(timer); timer = setTimeout(save, 400) }
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) win.on(ev as 'resize', schedule)
  win.on('close', () => { if (timer) clearTimeout(timer); save() })
}

export function createMainWindow(): BrowserWindow {
  nativeTheme.themeSource = getSettings().theme
  const state = loadState()
  const win = new BrowserWindow({
    ...state, minWidth: 720, minHeight: 480, show: false,
    title: 'Claudio',
    titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: themeBackground(),
    webPreferences: { preload: preloadPath(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true }
  })
  mainWindow = win
  if (state.maximized) win.maximize()
  if (state.fullscreen) win.setFullScreen(true)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })

  win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    openExternalSafe(url)
  })
  win.webContents.on('will-redirect', (e, url) => { if (!isAppUrl(url)) e.preventDefault() })

  trackState(win)
  loadRenderer(win, 'index')
  return win
}

export function showMainWindow(): BrowserWindow {
  const w = getMainWindow() ?? createMainWindow()
  if (w.isMinimized()) w.restore()
  w.show(); w.focus()
  return w
}
