// MCP server config file (claude_desktop_config-compatible `mcpServers` map) with zod validation.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { McpServerConfig, McpServerEntry } from '@shared/ipc'
import { log } from '../core/log'
import { dataPath, readJson, writeJson } from '../core/store'

const stringMap = z.record(z.string(), z.string())

const stdioSchema = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().trim().min(1),
  args: z.array(z.string()).optional(),
  env: stringMap.optional(),
  disabled: z.boolean().optional()
})

const remoteSchema = z.object({
  type: z.enum(['http', 'sse']),
  url: z.url({ protocol: /^https?$/ }),
  headers: stringMap.optional(),
  disabled: z.boolean().optional()
})

// Remote entries written without `type` (e.g. `{ url }`) default to streamable HTTP.
const serverSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !('type' in v) && 'url' in v && !('command' in v) ? { ...v, type: 'http' } : v),
  z.union([stdioSchema, remoteSchema])
)

export const serverNameSchema = z.string().trim().min(1).max(64).regex(/^[\w.\- ]+$/, 'Use letters, numbers, spaces, dot, dash or underscore')

export const entrySchema = z.object({
  name: serverNameSchema,
  enabled: z.boolean(),
  config: z.union([stdioSchema.omit({ disabled: true }), remoteSchema.omit({ disabled: true })])
})

interface RawConfig { mcpServers?: Record<string, unknown>; [k: string]: unknown }

export const configPath = (): string => dataPath('claudio_config.json')
export const claudeDesktopConfigPath = (): string => join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')

function readRaw(path = configPath()): RawConfig {
  const raw = readJson<unknown>(path, {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as RawConfig) : {}
}

function toConfig(v: z.infer<typeof stdioSchema> | z.infer<typeof remoteSchema>): McpServerConfig {
  if ('url' in v) return { type: v.type, url: v.url, ...(v.headers ? { headers: v.headers } : {}) }
  return { type: 'stdio', command: v.command, ...(v.args ? { args: v.args } : {}), ...(v.env ? { env: v.env } : {}) }
}

export function parseServer(name: string, value: unknown): McpServerEntry | null {
  const r = serverSchema.safeParse(value)
  if (!r.success) {
    log.warn(`[mcp] skipping invalid server "${name}": ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
    return null
  }
  return { name, config: toConfig(r.data), enabled: !r.data.disabled }
}

export function loadServers(): McpServerEntry[] {
  const servers = readRaw().mcpServers
  if (!servers || typeof servers !== 'object') return []
  return Object.entries(servers).flatMap(([name, v]) => parseServer(name, v) ?? [])
}

function serialize(e: McpServerEntry): Record<string, unknown> {
  const c = e.config
  const base: Record<string, unknown> =
    'url' in c
      ? { type: c.type, url: c.url, ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}) }
      : { command: c.command, ...(c.args?.length ? { args: c.args } : {}), ...(c.env && Object.keys(c.env).length ? { env: c.env } : {}) }
  return e.enabled ? base : { ...base, disabled: true }
}

function mutate(fn: (servers: Record<string, unknown>) => void): void {
  const raw = readRaw()
  const servers = raw.mcpServers && typeof raw.mcpServers === 'object' ? { ...raw.mcpServers } : {}
  fn(servers)
  writeJson(configPath(), { ...raw, mcpServers: servers })
}

export function ensureConfigFile(): string {
  if (!existsSync(configPath())) writeJson(configPath(), { mcpServers: {} })
  return configPath()
}

export function upsertServer(entry: McpServerEntry, previousName?: string): void {
  mutate((servers) => {
    if (previousName && previousName !== entry.name) {
      if (entry.name in servers) throw new Error(`A server named "${entry.name}" already exists`)
      // Keep the original position when renaming.
      const next = Object.fromEntries(Object.entries(servers).map(([k, v]) => (k === previousName ? [entry.name, serialize(entry)] : [k, v])))
      if (!(previousName in servers)) next[entry.name] = serialize(entry)
      for (const k of Object.keys(servers)) delete servers[k]
      Object.assign(servers, next)
    } else {
      servers[entry.name] = serialize(entry)
    }
  })
}

export function removeServer(name: string): void {
  mutate((servers) => { delete servers[name] })
}

export function importFromClaudeDesktop(): { imported: string[]; skipped: string[] } {
  const src = claudeDesktopConfigPath()
  if (!existsSync(src)) throw new Error(`Claude Desktop config not found at ${src}`)
  const incoming = readRaw(src).mcpServers
  const imported: string[] = []
  const skipped: string[] = []
  if (!incoming || typeof incoming !== 'object') return { imported, skipped }
  mutate((servers) => {
    for (const [name, value] of Object.entries(incoming)) {
      if (name in servers || !serverNameSchema.safeParse(name).success || !parseServer(name, value)) { skipped.push(name); continue }
      servers[name] = value
      imported.push(name)
    }
  })
  return { imported, skipped }
}
