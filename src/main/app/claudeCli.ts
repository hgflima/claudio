// Owner: agent "shell". Queries the user's `claude` CLI for version and login status.
import { execFile } from 'node:child_process'
import type { AuthStatus } from '@shared/ipc'
import { getShellEnv, resolveClaudePath } from '../core/shellEnv'
import { log } from '../core/log'

async function runClaude(args: string[], timeout = 15000): Promise<string> {
  const bin = await resolveClaudePath()
  if (!bin) throw new Error('claude CLI not found in PATH')
  const env = await getShellEnv()
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env, timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout.trim()) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
  })
}

let versionCache: Promise<string | null> | null = null
export function claudeVersion(): Promise<string | null> {
  versionCache ??= runClaude(['--version'], 10000)
    .then((out) => out.trim().split(/\s+/)[0] || null)
    .catch(() => { versionCache = null; return null })
  return versionCache
}

interface CliAuthJson { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string }

function mapMethod(m: string | undefined): AuthStatus['method'] {
  if (!m) return 'unknown'
  if (/claude\.ai|oauth|subscription/i.test(m)) return 'subscription'
  if (/api/i.test(m)) return 'api-key'
  return 'unknown'
}

export async function authStatus(): Promise<AuthStatus> {
  try {
    const out = await runClaude(['auth', 'status', '--json'])
    const j = JSON.parse(out.slice(out.indexOf('{'))) as CliAuthJson
    if (!j.loggedIn) return { loggedIn: false }
    return { loggedIn: true, method: mapMethod(j.authMethod), email: j.email, subscriptionType: j.subscriptionType }
  } catch (e) {
    log.warn('[app] auth status failed', String(e))
    return { loggedIn: false, error: e instanceof Error ? e.message : String(e) }
  }
}
