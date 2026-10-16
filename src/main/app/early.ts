// Owner: agent "shell". Called before app 'ready': claudio:// deep links and Finder/Dock "open file", queued until the UI is up.
import { app, BrowserWindow } from 'electron'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, normalize, resolve } from 'node:path'
import type { Events } from '@shared/ipc'
import { emit } from '../core/ipc'
import { log } from '../core/log'
import { getMainWindow, showMainWindow } from './windows'

type Routed =
  | { event: 'app:deepLink'; payload: Events['app:deepLink'] }
  | { event: 'ext:openRequested' | 'skills:openRequested'; payload: { filePath: string } }

const PROTOCOL = 'claudio'
const RESET_MARKER = 'reset-pending.json'
const MAX_QUERY = 20000

const pending: Routed[] = []
let uiReady = false

/** Absolute, normalized, existing path without `..` segments (after `~` expansion). */
export function safePath(input: string | null | undefined): string | null {
  if (!input || input.length > 4096 || input.includes('\0')) return null
  const expanded = input.startsWith('~/') ? join(homedir(), input.slice(2)) : input
  if (!isAbsolute(expanded) || expanded.split(/[\\/]/).includes('..')) return null
  const p = normalize(expanded)
  return existsSync(p) ? p : null
}

function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

export function parseDeepLink(raw: string): Routed | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== `${PROTOCOL}:`) return null
  const segments = [url.hostname, ...url.pathname.split('/')].filter(Boolean)
  const [route, ...rest] = segments

  if (route === 'new') {
    const q = url.searchParams.get('q')?.slice(0, MAX_QUERY) || undefined
    const folderParam = url.searchParams.get('folder')
    const folder = folderParam ? safePath(folderParam) : null
    if (folderParam && (!folder || !isDir(folder))) log.warn('[deeplink] ignoring invalid folder', folderParam)
    const k = url.searchParams.get('kind')
    const kind = k === 'code' || k === 'chat' ? k : undefined
    return { event: 'app:deepLink', payload: { action: 'new', q, folder: folder && isDir(folder) ? folder : undefined, kind } }
  }
  if (route === 'session') {
    const id = rest[0] ?? ''
    return /^[\w-]{1,80}$/.test(id) ? { event: 'app:deepLink', payload: { action: 'open-session', sessionId: id } } : null
  }
  return null
}

export function routeFile(raw: string): Routed | null {
  const p = safePath(raw)
  if (!p) return null
  if (isDir(p)) return { event: 'app:deepLink', payload: { action: 'new', folder: p, kind: 'code' } }
  const ext = extname(p).toLowerCase()
  if (ext === '.mcpb' || ext === '.dxt') return { event: 'ext:openRequested', payload: { filePath: p } }
  if (ext === '.skill') return { event: 'skills:openRequested', payload: { filePath: p } }
  return { event: 'app:deepLink', payload: { action: 'new', q: `@${p}` } }
}

function dispatch(r: Routed): void {
  showMainWindow()
  if (r.event === 'app:deepLink') emit('app:deepLink', r.payload)
  else emit(r.event, r.payload)
}

function flush(): void {
  if (!uiReady) return
  for (const r of pending.splice(0)) dispatch(r)
}

function enqueue(r: Routed | null): void {
  if (!r) return
  log.info('[deeplink] routed', r.event)
  pending.push(r)
  if (uiReady) flush()
  else if (app.isReady()) showMainWindow()
}

function handleArgv(argv: string[]): void {
  const own = new Set([process.execPath, app.getAppPath(), process.argv[1] ? resolve(process.argv[1]) : ''])
  for (const a of argv.slice(1)) {
    if (a.startsWith(`${PROTOCOL}:`)) enqueue(parseDeepLink(a))
    else if (!a.startsWith('-') && isAbsolute(a) && !own.has(resolve(a))) enqueue(routeFile(a))
  }
}

/** Mark the UI ready once the main window's renderer has mounted its listeners. */
function watchMainWindow(win: BrowserWindow): void {
  uiReady = false
  const ready = (): void => { setTimeout(() => { uiReady = true; flush() }, 400) }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', ready)
  else ready()
  win.once('closed', () => { uiReady = false })
}

/** Reset App Data runs on the next launch, before Chromium opens its files. */
function applyPendingReset(): void {
  const dir = app.getPath('userData')
  const marker = join(dir, RESET_MARKER)
  if (!existsSync(marker)) return
  let keepSessions = true
  try { keepSessions = (JSON.parse(readFileSync(marker, 'utf8')) as { keepSessions?: boolean }).keepSessions !== false } catch { /* default */ }
  const keep = new Set(keepSessions ? ['sessions', 'chat-scratch'] : [])
  for (const name of readdirSync(dir)) {
    if (keep.has(name)) continue
    try { rmSync(resolve(dir, name), { recursive: true, force: true }) } catch { /* locked file, skip */ }
  }
}

export function requestResetOnRelaunch(keepSessions: boolean): void {
  writeFileSync(join(app.getPath('userData'), RESET_MARKER), JSON.stringify({ keepSessions }))
}

export function registerEarlyApp(): void {
  applyPendingReset()

  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  else app.setAsDefaultProtocolClient(PROTOCOL)

  app.on('open-url', (e, url) => { e.preventDefault(); enqueue(parseDeepLink(url)) })
  app.on('open-file', (e, path) => { e.preventDefault(); enqueue(routeFile(path)) })
  app.on('second-instance', (_e, argv) => handleArgv(argv))
  app.on('browser-window-created', (_e, win) => {
    setImmediate(() => { if (getMainWindow() === win) watchMainWindow(win) })
  })
  if (process.platform !== 'darwin') handleArgv(process.argv)
}
