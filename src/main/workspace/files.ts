import { readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { z } from 'zod'
import { handle } from '../core/ipc'
import { assertDir } from './paths'
import { git, isRepo } from './git'

interface Entry { path: string; isDir: boolean; lower: string; base: string }
interface Index { entries: Entry[]; at: number; pending?: Promise<Entry[]> }

const TTL_MS = 30_000
const MAX_ENTRIES = 20_000
const MAX_DEPTH = 6
const IGNORED = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.cache', '.venv', '__pycache__', '.DS_Store'])
const cache = new Map<string, Index>()

function toEntry(path: string, isDir: boolean): Entry {
  const lower = path.toLowerCase()
  return { path, isDir, lower, base: posix.basename(lower) }
}

function withDirs(files: string[]): Entry[] {
  const dirs = new Set<string>()
  for (const f of files) {
    let d = posix.dirname(f)
    while (d !== '.' && !dirs.has(d)) { dirs.add(d); d = posix.dirname(d) }
  }
  const out: Entry[] = []
  for (const d of dirs) out.push(toEntry(d, true))
  for (const f of files) { if (out.length >= MAX_ENTRIES) break; out.push(toEntry(f, false)) }
  return out
}

async function walk(root: string): Promise<Entry[]> {
  const out: Entry[] = []
  const queue: { rel: string; depth: number }[] = [{ rel: '', depth: 0 }]
  while (queue.length && out.length < MAX_ENTRIES) {
    const { rel, depth } = queue.shift()!
    const items = await readdir(join(root, rel), { withFileTypes: true }).catch(() => [])
    for (const it of items) {
      if (IGNORED.has(it.name) || out.length >= MAX_ENTRIES) continue
      const p = rel ? `${rel}/${it.name}` : it.name
      if (it.isDirectory()) {
        out.push(toEntry(p, true))
        if (depth + 1 < MAX_DEPTH) queue.push({ rel: p, depth: depth + 1 })
      } else if (it.isFile() || it.isSymbolicLink()) out.push(toEntry(p, false))
    }
  }
  return out
}

async function build(cwd: string): Promise<Entry[]> {
  if (await isRepo(cwd)) {
    try {
      const out = await git(cwd, ['ls-files', '-co', '--exclude-standard', '-z'])
      const files = [...new Set(out.split('\0').filter(Boolean))]
      return withDirs(files)
    } catch { /* fall back to walk */ }
  }
  return walk(cwd)
}

async function getIndex(cwd: string): Promise<Entry[]> {
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < TTL_MS && !hit.pending) return hit.entries
  if (hit?.pending) return hit.pending
  const pending = build(cwd)
  cache.set(cwd, { entries: hit?.entries ?? [], at: hit?.at ?? 0, pending })
  try {
    const entries = await pending
    cache.set(cwd, { entries, at: Date.now() })
    if (cache.size > 20) cache.delete(cache.keys().next().value!)
    return entries
  } catch (e) {
    cache.delete(cwd)
    throw e
  }
}

/** Greedy subsequence score of `q` in `s`; -1 = no match. Rewards word boundaries and contiguous runs. */
function fuzzy(s: string, q: string): number {
  let si = 0
  let total = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const found = s.indexOf(q[qi], si)
    if (found < 0) return -1
    streak = found === si && qi > 0 ? streak + 1 : 0
    const prev = found > 0 ? s[found - 1] : '/'
    total += 10 + streak * 8
    if (found === 0 || '/-_. '.includes(prev)) total += 15
    total -= Math.min(found - si, 10)
    si = found + 1
  }
  return total
}

/** Higher is better, -1 = no match. Favors basename prefix > basename substring > path substring > basename fuzzy > path fuzzy. */
export function score(e: Entry, q: string): number {
  const len = e.path.length
  if (!q) return 1000 - len
  const baseIdx = e.base.indexOf(q)
  if (baseIdx === 0) return 10_000 - len + (e.base.length === q.length ? 2000 : 0)
  if (baseIdx > 0) return 8000 - len - baseIdx
  const pathIdx = e.lower.indexOf(q)
  if (pathIdx >= 0) return 6000 - len - pathIdx
  const b = fuzzy(e.base, q)
  if (b >= 0) return 4000 + b - len * 0.5
  const p = fuzzy(e.lower, q)
  return p < 0 ? -1 : p - len * 0.5
}

const searchSchema = z.object({ cwd: z.string(), query: z.string().max(500), limit: z.number().int().min(1).max(500).optional() })

async function search(raw: unknown): Promise<{ path: string; isDir: boolean }[]> {
  const opts = searchSchema.parse(raw)
  const cwd = await assertDir(opts.cwd)
  const limit = opts.limit ?? 20
  const q = opts.query.trim().toLowerCase().replace(/^@/, '').replace(/^\.\//, '')
  const entries = await getIndex(cwd)
  const scored: { e: Entry; s: number }[] = []
  for (const e of entries) {
    const s = score(e, q)
    if (s >= 0) scored.push({ e, s })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map(({ e }) => ({ path: e.path, isDir: e.isDir }))
}

export function registerFiles(): void {
  handle('files:search', (opts) => search(opts))
}
