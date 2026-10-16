import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let dir: string | null = null
function file(name: string): string {
  if (!dir) { dir = app.getPath('logs'); mkdirSync(dir, { recursive: true }) }
  return join(dir, name)
}
function write(level: string, args: unknown[], name = 'main.log'): void {
  const line = `${new Date().toISOString()} [${level}] ${args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  try { appendFileSync(file(name), line) } catch { /* ignore */ }
  ;(level === 'error' ? console.error : console.log)(line.trimEnd())
}
export const log = {
  info: (...a: unknown[]) => write('info', a),
  warn: (...a: unknown[]) => write('warn', a),
  error: (...a: unknown[]) => write('error', a),
  to: (name: string, level: string, ...a: unknown[]) => write(level, a, name),
  dir: () => (dir ?? app.getPath('logs'))
}
