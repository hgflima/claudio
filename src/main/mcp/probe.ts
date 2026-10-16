// Connects to an MCP server with the official SDK client, lists tools and disconnects.
import { app } from 'electron'
import { homedir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport, SseError } from '@modelcontextprotocol/sdk/client/sse.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerConfig, McpServerStatus } from '@shared/ipc'
import { log } from '../core/log'
import { getShellEnv } from '../core/shellEnv'

const TIMEOUT_MS = 20_000

export const serverLogName = (name: string): string => `mcp-server-${name.replace(/[^\w.-]+/g, '_')}.log`

async function stdioEnv(extra?: Record<string, string>): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(await getShellEnv())) if (v !== undefined) env[k] = v
  return { ...env, ...extra }
}

async function makeTransport(name: string, cfg: McpServerConfig): Promise<Transport> {
  if ('url' in cfg) {
    const url = new URL(cfg.url)
    const requestInit: RequestInit = { headers: cfg.headers ?? {} }
    return cfg.type === 'http' ? new StreamableHTTPClientTransport(url, { requestInit }) : new SSEClientTransport(url, { requestInit })
  }
  const t = new StdioClientTransport({ command: cfg.command, args: cfg.args ?? [], env: await stdioEnv(cfg.env), cwd: homedir(), stderr: 'pipe' })
  t.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trimEnd()
    if (text) log.to(serverLogName(name), 'stderr', text)
  })
  return t
}

function isAuthError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true
  if ((err instanceof StreamableHTTPError || err instanceof SseError) && (err.code === 401 || err.code === 403)) return true
  return err instanceof Error && /\b401\b|unauthorized/i.test(err.message)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms) })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

export async function probeServer(name: string, cfg: McpServerConfig): Promise<McpServerStatus> {
  const file = serverLogName(name)
  const client = new Client({ name: 'claudio', version: app.getVersion() })
  log.to(file, 'info', `[probe] connecting (${cfg.type ?? 'stdio'})`)
  try {
    const tools = await withTimeout((async () => {
      await client.connect(await makeTransport(name, cfg))
      const names: string[] = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined)
        names.push(...page.tools.map((t) => t.name))
        cursor = page.nextCursor
      } while (cursor)
      return names
    })(), TIMEOUT_MS)
    log.to(file, 'info', `[probe] connected, ${tools.length} tools`)
    return { name, status: 'connected', tools, checkedAt: Date.now() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.to(file, 'error', `[probe] failed: ${message}`)
    if (isAuthError(err)) return { name, status: 'needs-auth', error: 'The server requires authentication (401). Add an Authorization header.', checkedAt: Date.now() }
    return { name, status: 'failed', error: message, checkedAt: Date.now() }
  } finally {
    await client.close().catch(() => undefined)
  }
}
