import { execFile } from 'node:child_process'
import { z } from 'zod'
import type { GitFileStatus, GitStatus } from '@shared/ipc'
import { handle } from '../core/ipc'
import { getShellEnv } from '../core/shellEnv'
import { assertDir, assertInside } from './paths'

const MAX_BUFFER = 64 * 1024 * 1024

interface RunResult { stdout: string; code: number }

export async function git(cwd: string, args: string[], okCodes: number[] = [0]): Promise<string> {
  const r = await runGit(cwd, args)
  if (!okCodes.includes(r.code)) throw new Error(`git ${args[0]} exited with ${r.code}`)
  return r.stdout
}

async function runGit(cwd: string, args: string[]): Promise<RunResult> {
  const env = { ...(await getShellEnv()), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args], { cwd, env, maxBuffer: MAX_BUFFER, timeout: 10_000 }, (err, stdout, stderr) => {
      if (!err) return resolve({ stdout, code: 0 })
      const code = typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : -1
      if (code > 0) return resolve({ stdout, code })
      reject(new Error(stderr?.trim() || err.message))
    })
  })
}

export async function isRepo(cwd: string): Promise<boolean> {
  const r = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']).catch(() => null)
  return r?.code === 0 && r.stdout.trim() === 'true'
}

/** Top-level of the work tree containing `cwd`, or null. Status/diff paths are relative to it. */
async function repoRoot(cwd: string): Promise<string | null> {
  const r = await runGit(cwd, ['rev-parse', '--show-toplevel']).catch(() => null)
  return r?.code === 0 && r.stdout.trim() ? r.stdout.trim() : null
}

function mapXY(c: string): GitFileStatus | null {
  switch (c) {
    case 'M': case 'T': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': case 'C': return 'R'
    case 'U': return 'U'
    default: return null
  }
}

type NumStat = Map<string, { add: number; del: number }>

function parseNumstat(out: string): NumStat {
  const m: NumStat = new Map()
  // -z format: "add\tdel\tpath\0" or for renames "add\tdel\t\0old\0new\0"
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    const [a, d, path] = p.split('\t')
    let file = path
    if (path === '') { i += 2; file = parts[i] }
    if (!file) continue
    m.set(file, { add: a === '-' ? 0 : Number(a), del: d === '-' ? 0 : Number(d) })
  }
  return m
}

async function countLines(cwd: string, rel: string): Promise<number | undefined> {
  const { readFile, stat } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const abs = join(cwd, rel)
  const st = await stat(abs).catch(() => null)
  if (!st?.isFile() || st.size > 2 * 1024 * 1024) return undefined
  const buf = await readFile(abs)
  if (buf.subarray(0, 8000).includes(0)) return undefined
  if (buf.length === 0) return 0
  let n = 0
  for (const b of buf) if (b === 10) n++
  return buf[buf.length - 1] === 10 ? n : n + 1
}

async function status(rawCwd: unknown): Promise<GitStatus> {
  const root = await repoRoot(await assertDir(rawCwd))
  if (!root) return { isRepo: false, branch: null, files: [] }
  const cwd = root

  const [porcelain, unstagedNum, stagedNum] = await Promise.all([
    git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    git(cwd, ['diff', '--numstat', '-z']).catch(() => ''),
    git(cwd, ['diff', '--cached', '--numstat', '-z']).catch(() => '')
  ])
  const unstaged = parseNumstat(unstagedNum)
  const staged = parseNumstat(stagedNum)

  const res: GitStatus = { isRepo: true, branch: null, files: [] }
  const entries = porcelain.split('\0')
  const untracked: number[] = []
  for (let i = 0; i < entries.length; i++) {
    const line = entries[i]
    if (!line) continue
    if (line.startsWith('# branch.head ')) {
      const h = line.slice(14)
      res.branch = h === '(detached)' ? 'HEAD (detached)' : h
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) { res.ahead = Number(m[1]); res.behind = Number(m[2]) }
    } else if (line[0] === '1' || line[0] === '2') {
      const f = line.split(' ')
      const xy = f[1]
      const path = line[0] === '1' ? f.slice(8).join(' ') : f.slice(9).join(' ')
      if (line[0] === '2') i++ // skip original path
      const x = mapXY(xy[0])
      const y = mapXY(xy[1])
      if (x) {
        const n = staged.get(path)
        res.files.push({ path, status: x, staged: true, additions: n?.add, deletions: n?.del })
      }
      if (y) {
        const n = unstaged.get(path)
        res.files.push({ path, status: y, staged: false, additions: n?.add, deletions: n?.del })
      }
    } else if (line[0] === 'u') {
      const path = line.split(' ').slice(10).join(' ')
      res.files.push({ path, status: 'U', staged: false })
    } else if (line[0] === '?') {
      untracked.push(res.files.length)
      res.files.push({ path: line.slice(2), status: '?', staged: false, deletions: 0 })
    }
  }
  await Promise.all(untracked.slice(0, 200).map(async (idx) => {
    res.files[idx].additions = await countLines(cwd, res.files[idx].path)
  }))
  return res
}

const diffSchema = z.object({ cwd: z.string(), path: z.string().optional(), staged: z.boolean().optional() })

async function diff(raw: unknown): Promise<string> {
  const opts = diffSchema.parse(raw)
  const cwd = await repoRoot(await assertDir(opts.cwd))
  if (!cwd) return ''
  const rel = opts.path ? assertInside(cwd, opts.path) : undefined
  const base = ['diff', '--no-color', '--no-ext-diff', '-M']
  if (rel) {
    const tracked = await runGit(cwd, ['ls-files', '--error-unmatch', '--', rel])
    if (tracked.code !== 0 && !opts.staged) {
      return git(cwd, [...base, '--no-index', '--', '/dev/null', rel], [0, 1])
    }
  }
  const args = [...base, ...(opts.staged ? ['--cached'] : [])]
  if (rel) args.push('--', rel)
  return git(cwd, args)
}

export function registerGit(): void {
  handle('git:status', (cwd) => status(cwd))
  handle('git:diff', (opts) => diff(opts))
}
