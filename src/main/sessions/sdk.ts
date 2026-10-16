// Lazy ESM import of the Agent SDK (main bundle is CJS) + subscription-only spawn environment.
import { app } from 'electron'
import { getShellEnv, resolveClaudePath } from '../core/shellEnv'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<Sdk> | null = null

export function loadSdk(): Promise<Sdk> {
  sdkPromise ??= import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

/** Variables that would make the CLI bill an API account instead of the user's subscription. */
const API_BILLING_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']

export async function spawnEnv(): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...(await getShellEnv()) }
  for (const k of API_BILLING_VARS) delete env[k]
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `claudio/${app.getVersion()}`
  return env
}

export class ClaudeMissingError extends Error {
  constructor() {
    super('Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code or https://claude.ai/install.sh) and run `claude` once to log in.')
  }
}

export async function claudeExecutable(): Promise<string> {
  const p = await resolveClaudePath()
  if (!p) throw new ClaudeMissingError()
  return p
}
