// GUI apps on macOS don't inherit the user's login-shell PATH. Resolve it once (like Claude Desktop's shell-path-worker).
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { log } from './log'

let envPromise: Promise<NodeJS.ProcessEnv> | null = null

function runShell(shell: string): Promise<NodeJS.ProcessEnv> {
  const mark = '__CLAUDIO_ENV__'
  return new Promise((resolve, reject) => {
    execFile(shell, ['-l', '-i', '-c', `echo ${mark}; env -0`], {
      timeout: 5000, maxBuffer: 10 * 1024 * 1024,
      env: { HOME: homedir(), USER: process.env.USER, SHELL: shell, TERM: 'dumb', DISABLE_AUTO_UPDATE: 'true', ZSH_DISABLE_COMPFIX: 'true', CLAUDIO_RESOLVING_ENVIRONMENT: '1' }
    }, (err, stdout) => {
      if (err && !stdout.includes(mark)) return reject(err)
      const body = stdout.slice(stdout.indexOf(mark) + mark.length + 1)
      const env: NodeJS.ProcessEnv = {}
      for (const pair of body.split('\0')) {
        const i = pair.indexOf('=')
        if (i > 0) env[pair.slice(0, i)] = pair.slice(i + 1)
      }
      for (const k of ['PWD', 'OLDPWD', 'SHLVL', '_', 'CLAUDIO_RESOLVING_ENVIRONMENT']) delete env[k]
      resolve(env)
    })
  })
}

/** Login-shell environment merged over process.env. Cached. */
export function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  envPromise ??= (async () => {
    const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean) as string[]
    for (const sh of candidates) {
      try {
        const env = await runShell(sh)
        if (env.PATH) { log.info(`[shellEnv] resolved via ${sh}`); return { ...process.env, ...env } }
      } catch (e) { log.warn(`[shellEnv] ${sh} failed`, String(e)) }
    }
    const fallbackPath = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':')
    return { ...process.env, PATH: `${process.env.PATH ?? ''}:${fallbackPath}` }
  })()
  return envPromise
}

/** Absolute path to the `claude` CLI, or null. */
export async function resolveClaudePath(): Promise<string | null> {
  const env = await getShellEnv()
  for (const dir of (env.PATH ?? '').split(':')) {
    const p = join(dir, 'claude')
    if (dir && existsSync(p)) return p
  }
  const local = join(homedir(), '.local/bin/claude')
  return existsSync(local) ? local : null
}
