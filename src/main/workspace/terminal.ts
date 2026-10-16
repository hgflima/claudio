import { app } from 'electron'
import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { IPty } from 'node-pty'
import { emit, handle } from '../core/ipc'
import { getShellEnv } from '../core/shellEnv'
import { log } from '../core/log'
import { assertDir } from './paths'

interface PtyEntry { pty: IPty; key?: string; buf: string; timer: NodeJS.Timeout | null }

const ptys = new Map<string, PtyEntry>()
const byKey = new Map<string, string>()
const FLUSH_MS = 8

/** node-pty 1.x ships spawn-helper without +x in some installs → "posix_spawnp failed". */
function ensureSpawnHelperExecutable(): void {
  if (process.platform === 'win32') return
  try {
    const root = join(app.getAppPath(), 'node_modules', 'node-pty').replace('app.asar', 'app.asar.unpacked')
    for (const dir of ['build/Release', `prebuilds/${process.platform}-${process.arch}`]) {
      const helper = join(root, dir, 'spawn-helper')
      if (!existsSync(helper)) continue
      try { accessSync(helper, constants.X_OK) } catch { chmodSync(helper, 0o755); log.info(`[terminal] chmod +x ${helper}`) }
    }
  } catch (e) { log.warn('[terminal] spawn-helper check failed', String(e)) }
}

function flush(ptyId: string): void {
  const e = ptys.get(ptyId)
  if (!e) return
  e.timer = null
  if (!e.buf) return
  const data = e.buf
  e.buf = ''
  emit('terminal:data', { ptyId, data })
}

function remove(ptyId: string): void {
  const e = ptys.get(ptyId)
  if (!e) return
  if (e.timer) clearTimeout(e.timer)
  flush(ptyId)
  ptys.delete(ptyId)
  if (e.key && byKey.get(e.key) === ptyId) byKey.delete(e.key)
}

const createSchema = z.object({
  cwd: z.string(),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(500),
  key: z.string().min(1).max(200).optional()
})

async function create(raw: unknown): Promise<{ ptyId: string; reused: boolean }> {
  const opts = createSchema.parse(raw)
  if (opts.key) {
    const existing = byKey.get(opts.key)
    if (existing && ptys.has(existing)) {
      ptys.get(existing)!.pty.resize(opts.cols, opts.rows)
      return { ptyId: existing, reused: true }
    }
  }
  const cwd = await assertDir(opts.cwd)
  const env = await getShellEnv()
  const shell = env.SHELL || process.env.SHELL || '/bin/zsh'
  const { spawn } = await import('node-pty')
  const ptyEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') ptyEnv[k] = v
  Object.assign(ptyEnv, { TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Claudio' })
  delete ptyEnv.ELECTRON_RUN_AS_NODE

  const pty = spawn(shell, ['-l'], { name: 'xterm-256color', cols: opts.cols, rows: opts.rows, cwd, env: ptyEnv })
  const ptyId = randomUUID()
  const entry: PtyEntry = { pty, key: opts.key, buf: '', timer: null }
  ptys.set(ptyId, entry)
  if (opts.key) byKey.set(opts.key, ptyId)

  pty.onData((d) => {
    entry.buf += d
    entry.timer ??= setTimeout(() => flush(ptyId), FLUSH_MS)
  })
  pty.onExit(({ exitCode, signal }) => {
    remove(ptyId)
    emit('terminal:exit', { ptyId, exitCode: signal ? 128 + signal : exitCode })
  })
  log.info(`[terminal] spawned ${shell} pid=${pty.pid} cwd=${cwd}`)
  return { ptyId, reused: false }
}

function killAll(): void {
  for (const [id, e] of ptys) {
    try { e.pty.kill() } catch { /* already gone */ }
    remove(id)
  }
}

export function registerTerminal(): void {
  ensureSpawnHelperExecutable()
  handle('terminal:create', (opts) => create(opts))
  handle('terminal:write', (ptyId, data) => {
    if (typeof data === 'string') ptys.get(ptyId)?.pty.write(data)
  })
  handle('terminal:resize', (ptyId, cols, rows) => {
    const e = ptys.get(ptyId)
    if (!e || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return
    try { e.pty.resize(cols, rows) } catch { /* pty may have exited */ }
  })
  handle('terminal:kill', (ptyId) => {
    const e = ptys.get(ptyId)
    if (!e) return
    try { e.pty.kill() } catch { /* already gone */ }
  })
  app.on('before-quit', killAll)
}
