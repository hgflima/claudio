// Tiny JSON file store in userData. Atomic writes.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function dataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}
export function readJson<T>(path: string, fallback: T): T {
  try { return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback } catch { return fallback }
}
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(tmp, path)
}
