// Zip extraction via the system `ditto` (no extra deps) into throwaway staging folders.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { dataPath } from '../core/store'

const run = promisify(execFile)

export function assertFile(path: string, exts: string[], maxBytes: number): void {
  const lower = path.toLowerCase()
  if (!exts.some((e) => lower.endsWith(e))) throw new Error(`Expected a ${exts.join(' or ')} file`)
  let size: number
  try { size = statSync(path).size } catch { throw new Error(`File not found: ${path}`) }
  if (size > maxBytes) throw new Error(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`)
}

/** Extracts a zip into a new staging dir. Caller must `rmSync` it. Rejects archives containing symlinks. */
export async function extractToStaging(zipPath: string): Promise<string> {
  const dir = dataPath('staging', randomUUID())
  mkdirSync(dir, { recursive: true })
  try {
    await run('/usr/bin/ditto', ['-x', '-k', '--norsrc', zipPath, dir], { timeout: 120_000 })
    rmSync(join(dir, '__MACOSX'), { recursive: true, force: true })
    for (const f of walk(dir)) if (lstatSync(f).isSymbolicLink()) throw new Error(`Archive contains a symlink (${relative(dir, f)}), which is not allowed`)
    return dir
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    if (err instanceof Error && /ditto/.test(err.message)) throw new Error('Could not read the archive (is it a valid zip file?)')
    throw err
  }
}

/** All paths (files and dirs) under `dir`, without following symlinks. */
export function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    out.push(p)
    if (e.isDirectory()) out.push(...walk(p))
  }
  return out
}

export const slugify = (s: string): string =>
  s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
