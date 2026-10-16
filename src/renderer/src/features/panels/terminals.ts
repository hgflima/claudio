// Renderer-side registry of xterm instances. Lives outside React so terminals survive panel/session switches.
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { api } from '@/lib/api'
import { terminalFontFamily, terminalTheme } from './terminalTheme'

export interface TermHandle {
  key: string
  cwd: string
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  ptyId: string | null
  exited: boolean
  starting: Promise<void> | null
}

const handles = new Map<string, TermHandle>()
const byPty = new Map<string, TermHandle>()
const orphanData = new Map<string, string>()
const listeners = new Set<() => void>()
let wired = false

function notify(): void { for (const l of listeners) l() }

export function subscribeTerminals(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function wireIpc(): void {
  if (wired) return
  wired = true
  api.on('terminal:data', ({ ptyId, data }) => {
    const h = byPty.get(ptyId)
    if (h) h.term.write(data)
    else orphanData.set(ptyId, (orphanData.get(ptyId) ?? '') + data)
  })
  api.on('terminal:exit', ({ ptyId, exitCode }) => {
    const h = byPty.get(ptyId)
    orphanData.delete(ptyId)
    if (!h) return
    byPty.delete(ptyId)
    h.ptyId = null
    h.exited = true
    h.term.write(`\r\n\x1b[2m[Process exited with code ${exitCode}. Press any key to restart.]\x1b[0m\r\n`)
    notify()
  })
  new MutationObserver(() => {
    const theme = terminalTheme()
    for (const h of handles.values()) h.term.options.theme = theme
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
}

function attachPty(h: TermHandle, ptyId: string): void {
  h.ptyId = ptyId
  h.exited = false
  byPty.set(ptyId, h)
  const pending = orphanData.get(ptyId)
  if (pending) { orphanData.delete(ptyId); h.term.write(pending) }
}

export function startPty(h: TermHandle): Promise<void> {
  if (h.starting) return h.starting
  h.starting = (async () => {
    try {
      const { cols, rows } = h.term
      const { ptyId } = await api.invoke('terminal:create', { cwd: h.cwd, cols, rows, key: h.key })
      attachPty(h, ptyId)
    } catch (err) {
      h.exited = true
      h.term.write(`\x1b[31mFailed to start terminal: ${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
    } finally {
      h.starting = null
      notify()
    }
  })()
  return h.starting
}

export function getTerminal(key: string, cwd: string): TermHandle {
  wireIpc()
  const existing = handles.get(key)
  if (existing && existing.cwd === cwd) return existing
  if (existing) disposeTerminal(key)

  const term = new Terminal({
    fontFamily: terminalFontFamily(),
    fontSize: 12.5,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    theme: terminalTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((e, uri) => { e.preventDefault(); window.open(uri, '_blank') }))
  const el = document.createElement('div')
  el.className = 'h-full w-full'
  const h: TermHandle = { key, cwd, term, fit, el, ptyId: null, exited: false, starting: null }
  term.onData((data) => {
    if (h.ptyId) void api.invoke('terminal:write', h.ptyId, data)
    else if (h.exited) { term.reset(); void startPty(h) }
  })
  term.onResize(({ cols, rows }) => { if (h.ptyId) void api.invoke('terminal:resize', h.ptyId, cols, rows) })
  handles.set(key, h)
  return h
}

/** Kills the pty and spawns a fresh shell in the same terminal. */
export async function restartTerminal(h: TermHandle): Promise<void> {
  const old = h.ptyId
  if (old) {
    byPty.delete(old)
    h.ptyId = null
    await api.invoke('terminal:kill', old).catch(() => undefined)
  }
  h.term.reset()
  h.exited = false
  await startPty(h)
}

export function disposeTerminal(key: string): void {
  const h = handles.get(key)
  if (!h) return
  handles.delete(key)
  if (h.ptyId) { byPty.delete(h.ptyId); void api.invoke('terminal:kill', h.ptyId).catch(() => undefined) }
  h.term.dispose()
  h.el.remove()
  notify()
}
