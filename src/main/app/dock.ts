// Owner: agent "shell". macOS Dock: app icon in dev and a menu with recent sessions.
import { app, Menu, nativeImage } from 'electron'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionMeta } from '@shared/ipc'
import { bus } from '../core/bus'
import { emit } from '../core/ipc'
import { dataPath, readJson } from '../core/store'
import { sendCommand } from './menu'
import { showMainWindow } from './windows'

const RECENT = 5
type Recent = Pick<SessionMeta, 'id' | 'title' | 'lastActivityAt' | 'archived'>

const known = new Map<string, Recent>()
let liveEvents = false // true once sessions-core emits bus events; until then, disk is the fallback source
let lastSignature = ''
let timer: NodeJS.Timeout | null = null

function loadFromDisk(): void {
  const dir = dataPath('sessions')
  known.clear()
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const m = readJson<Partial<SessionMeta> | null>(join(dir, f), null)
    if (m?.id) known.set(m.id, { id: m.id, title: m.title ?? '', lastActivityAt: m.lastActivityAt ?? 0, archived: !!m.archived })
  }
}

function recentSessions(): Recent[] {
  return [...known.values()].filter((s) => !s.archived).sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, RECENT)
}

function rebuildDockMenu(): void {
  const recents = recentSessions()
  const signature = recents.map((s) => `${s.id}:${s.title}`).join('|')
  if (signature === lastSignature && lastSignature) return
  lastSignature = signature
  app.dock?.setMenu(Menu.buildFromTemplate([
    { label: 'New Session', click: () => sendCommand('new-session') },
    { label: 'New Chat', click: () => sendCommand('new-chat') },
    ...(recents.length ? [{ type: 'separator' as const }] : []),
    ...recents.map((s) => ({
      label: s.title.trim() || 'Untitled session',
      click: () => { showMainWindow(); emit('app:navigate', { sessionId: s.id }) }
    }))
  ]))
}

function scheduleRebuild(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(rebuildDockMenu, 300)
}

function refreshFallback(): void {
  if (liveEvents) return
  loadFromDisk()
  scheduleRebuild()
}

function devIcon(): void {
  if (app.isPackaged) return
  const p = join(app.getAppPath(), 'build', 'icon.png')
  if (existsSync(p)) app.dock?.setIcon(nativeImage.createFromPath(p))
}

export function registerDock(): void {
  if (process.platform !== 'darwin') return
  devIcon()
  loadFromDisk()
  rebuildDockMenu()
  bus.onBus('session:changed', ({ session: s }) => {
    liveEvents = true
    known.set(s.id, { id: s.id, title: s.title, lastActivityAt: s.lastActivityAt, archived: s.archived })
    scheduleRebuild()
  })
  bus.onBus('session:removed', ({ sessionId }) => { liveEvents = true; known.delete(sessionId); scheduleRebuild() })
  bus.onBus('session:turn-finished', refreshFallback)
  app.on('did-become-active', refreshFallback)
}
