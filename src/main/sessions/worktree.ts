// Git worktrees per session: <repoRoot>/.claude/worktrees/<slug> on branch claude/<slug>.
import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { SessionMeta } from '@shared/ipc'
import { getShellEnv } from '../core/shellEnv'

export type WorktreeInfo = NonNullable<SessionMeta['worktree']>

async function git(cwd: string, args: string[]): Promise<string> {
  const env = await getShellEnv()
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message).trim().replace(/^fatal:\s*/i, '')
        reject(new Error(`git ${args[0]} failed: ${msg}`))
      } else resolve(stdout)
    })
  })
}

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'session'
}

async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  try { await git(repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]); return true } catch { return false }
}

/** Minimal gitignore-style glob → RegExp. Patterns without "/" match at any depth. */
function globToRegExp(pattern: string): RegExp {
  let p = pattern.replace(/^\//, '').replace(/\/$/, '/**')
  const anchored = pattern.startsWith('/') || p.includes('/')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') { re += '.*'; i++; if (p[i + 1] === '/') i++ }
    else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  p = re
  return new RegExp(anchored ? `^${p}$` : `(^|/)${p}$`)
}

async function copyIncludedFiles(repoRoot: string, worktreePath: string): Promise<number> {
  const includeFile = join(repoRoot, '.worktreeinclude')
  if (!existsSync(includeFile)) return 0
  const patterns = readFileSync(includeFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!patterns.length) return 0
  const matchers = patterns.map(globToRegExp)
  const listed = await git(repoRoot, ['ls-files', '--others', '-z', '--exclude-standard', '--ignored', '--directory', '--no-empty-directory'])
    .catch(() => '')
  const untracked = await git(repoRoot, ['ls-files', '--others', '-z', '--exclude-standard']).catch(() => '')
  const candidates = new Set([...listed.split('\0'), ...untracked.split('\0')].filter((f) => f && !f.endsWith('/') && !f.startsWith('.claude/worktrees/')))
  let copied = 0
  for (const rel of candidates) {
    if (!matchers.some((m) => m.test(rel))) continue
    const dest = join(worktreePath, rel)
    try {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(join(repoRoot, rel), dest)
      copied++
    } catch { /* unreadable or vanished */ }
  }
  return copied
}

export interface CreatedWorktree { info: WorktreeInfo; cwd: string; copiedFiles: number }

/** Repo root of `cwd`, or a clear error if it isn't a git repository. */
export async function gitRepoRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    throw new Error('Worktrees need a git repository, but this folder is not inside one.')
  }
}

export async function createWorktree(originCwd: string, name: string, baseBranch?: string): Promise<CreatedWorktree> {
  const repoRoot = await gitRepoRoot(originCwd)
  const base = baseBranch?.trim() || (await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).then((s) => s.trim()).catch(() => 'HEAD'))
  if (base === 'HEAD') {
    try { await git(repoRoot, ['rev-parse', '--verify', 'HEAD']) } catch { throw new Error('This repository has no commits yet, so a worktree cannot be created.') }
  }
  const root = slugify(name)
  let slug = root
  for (let n = 2; existsSync(join(repoRoot, '.claude', 'worktrees', slug)) || (await branchExists(repoRoot, `claude/${slug}`)); n++) slug = `${root}-${n}`
  const path = join(repoRoot, '.claude', 'worktrees', slug)
  const branch = `claude/${slug}`
  mkdirSync(dirname(path), { recursive: true })
  await git(repoRoot, ['worktree', 'add', path, '-b', branch, base])
  const copiedFiles = await copyIncludedFiles(repoRoot, path)
  const sub = relative(repoRoot, originCwd)
  const cwd = sub && !sub.startsWith('..') ? join(path, sub) : path
  mkdirSync(cwd, { recursive: true })
  return { info: { path, branch, baseBranch: base, originCwd }, cwd, copiedFiles }
}

export async function removeWorktree(info: WorktreeInfo, force = false): Promise<void> {
  if (!existsSync(info.path)) {
    await git(info.originCwd, ['worktree', 'prune']).catch(() => {})
    return
  }
  try {
    await git(info.originCwd, ['worktree', 'remove', ...(force ? ['--force'] : []), info.path])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/modified or untracked|contains modified/i.test(msg)) {
      throw new Error(`The worktree has uncommitted changes. Commit or discard them in ${info.path} first (branch ${info.branch} is kept).`)
    }
    throw e
  }
}
