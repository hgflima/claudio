// Folder trust: blocks dangerous/unsupported roots, then checks settings.trustedFolders (incl. parents).
import { execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { TrustCheck } from '@shared/ipc'
import { addRecentFolder, getSettings, setSettings } from '../core/settings'

const NETWORK_FS = new Set(['smbfs', 'afpfs', 'nfs', 'webdav', 'cifs', 'ftp', 'osxfuse', 'macfuse', 'sshfs'])

function canonical(p: string): string {
  const abs = resolve(p)
  try { return realpathSync(abs) } catch { return abs }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function mountTypeOf(path: string): Promise<string | null> {
  return new Promise((done) => {
    execFile('/sbin/mount', [], { timeout: 3000 }, (err, stdout) => {
      if (err) return done(null)
      let best: { point: string; type: string } | null = null
      for (const line of stdout.split('\n')) {
        const m = / on (.+) \(([^,)]+)/.exec(line)
        if (!m) continue
        const [, point, type] = m
        if (isInside(path, point) && (!best || point.length > best.point.length)) best = { point, type }
      }
      done(best?.type ?? null)
    })
  })
}

export async function checkTrust(cwd: string): Promise<TrustCheck> {
  if (typeof cwd !== 'string' || !cwd || !isAbsolute(cwd)) return { trusted: false, blocked: 'missing', reason: 'Path must be absolute.' }
  const path = canonical(cwd)
  if (!existsSync(path) || !statSync(path).isDirectory()) return { trusted: false, blocked: 'missing', reason: 'This folder does not exist.' }
  if (path === sep) return { trusted: false, blocked: 'root', reason: 'The filesystem root cannot be used as a project folder.' }
  if (path === canonical(homedir())) return { trusted: false, blocked: 'home', reason: 'Your home folder is too broad. Choose a project folder inside it.' }
  if (path.startsWith('/Volumes/') || process.platform !== 'darwin') {
    const type = await mountTypeOf(path)
    if (type && NETWORK_FS.has(type)) return { trusted: false, blocked: 'network', reason: `Network volumes (${type}) are not supported.` }
  }
  const trusted = getSettings().trustedFolders.some((t) => isInside(path, canonical(t)))
  return trusted ? { trusted: true } : { trusted: false }
}

export async function trustFolder(cwd: string): Promise<void> {
  const check = await checkTrust(cwd)
  if (!check.trusted && check.blocked) throw new Error(check.reason ?? 'Folder cannot be trusted')
  const path = canonical(cwd)
  const s = getSettings()
  if (!s.trustedFolders.includes(path)) setSettings({ trustedFolders: [...s.trustedFolders, path] })
  addRecentFolder(path)
}

export { canonical as canonicalPath }
