// Owner: agent "mcp-quick". MCP config + status, skills listing.
import { shell } from 'electron'
import { z } from 'zod'
import type { McpServerConfig, McpServerEntry, McpServerStatus } from '@shared/ipc'
import { bus } from '../core/bus'
import { emit, handle } from '../core/ipc'
import { log } from '../core/log'
import { configPath, ensureConfigFile, entrySchema, importFromClaudeDesktop, loadServers, removeServer, serverNameSchema, upsertServer } from './config'
import { probeServer } from './probe'
import { listSkills } from './skills'

let servers: McpServerEntry[] = []
const statuses = new Map<string, McpServerStatus>()
const generation = new Map<string, number>() // drops stale probe results after edits/reloads

function statusList(): McpServerStatus[] {
  return servers.map((s) => statuses.get(s.name) ?? { name: s.name, status: s.enabled ? 'pending' : 'disabled' })
}

const broadcast = (): void => emit('mcp:changed', statusList())

async function test(name: string): Promise<McpServerStatus> {
  const entry = servers.find((s) => s.name === name)
  if (!entry) throw new Error(`Unknown MCP server "${name}"`)
  const gen = (generation.get(name) ?? 0) + 1
  generation.set(name, gen)
  statuses.set(name, { name, status: 'pending', tools: statuses.get(name)?.tools })
  broadcast()
  const result = await probeServer(name, entry.config)
  if (generation.get(name) === gen && servers.some((s) => s.name === name)) {
    statuses.set(name, result)
    broadcast()
  }
  return result
}

function testAllInBackground(): void {
  for (const s of servers) if (s.enabled) void test(s.name).catch((e) => log.warn(`[mcp] test ${s.name} failed`, e))
}

/** Re-reads the config file; probes servers whose config changed (or all when `retestAll`). */
function reload(retestAll: boolean): void {
  const before = new Map(servers.map((s) => [s.name, JSON.stringify(s)]))
  servers = loadServers()
  for (const name of [...statuses.keys()]) if (!servers.some((s) => s.name === name)) { statuses.delete(name); generation.delete(name) }
  for (const s of servers) {
    const changed = before.get(s.name) !== JSON.stringify(s)
    if (!s.enabled) { generation.set(s.name, (generation.get(s.name) ?? 0) + 1); statuses.set(s.name, { name: s.name, status: 'disabled' }) }
    else if (retestAll || changed) void test(s.name).catch((e) => log.warn(`[mcp] test ${s.name} failed`, e))
  }
  bus.emitBus('mcp:config-changed', undefined)
  broadcast()
}

export function registerMcp(): void {
  servers = loadServers()
  log.info(`[mcp] loaded ${servers.length} server(s) from ${configPath()}`)
  for (const s of servers) if (!s.enabled) statuses.set(s.name, { name: s.name, status: 'disabled' })
  testAllInBackground()

  handle('mcp:list', () => ({ configPath: configPath(), servers }))
  handle('mcp:status', () => statusList())
  handle('mcp:test', (name) => test(serverNameSchema.parse(name)))
  handle('mcp:upsert', (entry, previousName) => {
    const parsed = entrySchema.parse(entry) as McpServerEntry
    const prev = previousName === undefined ? undefined : serverNameSchema.parse(previousName)
    if (prev === undefined && servers.some((s) => s.name === parsed.name)) throw new Error(`A server named "${parsed.name}" already exists`)
    upsertServer(parsed, prev)
    if (prev && prev !== parsed.name) { statuses.delete(prev); generation.delete(prev) }
    reload(false)
  })
  handle('mcp:remove', (name) => { removeServer(serverNameSchema.parse(name)); reload(false) })
  handle('mcp:reload', () => reload(true))
  handle('mcp:openConfig', async () => {
    const err = await shell.openPath(ensureConfigFile())
    if (err) throw new Error(err)
  })
  handle('mcp:openLogs', async () => {
    const err = await shell.openPath(log.dir())
    if (err) throw new Error(err)
  })
  handle('mcp:importClaudeDesktop', () => {
    const result = importFromClaudeDesktop()
    log.info(`[mcp] imported from Claude Desktop: ${result.imported.join(', ') || '(none)'}; skipped: ${result.skipped.join(', ') || '(none)'}`)
    if (result.imported.length) reload(false)
    return result
  })
  handle('skills:list', (cwd) => listSkills(z.string().optional().parse(cwd)))
}

/** Enabled MCP servers in Agent SDK `mcpServers` shape. Called by sessions-core on every session start. */
export function getEnabledMcpServers(): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}
  for (const s of servers) {
    if (!s.enabled) continue
    const c = s.config
    out[s.name] = 'url' in c
      ? { type: c.type, url: c.url, headers: c.headers ?? {} }
      : { type: 'stdio', command: c.command, args: c.args ?? [], env: c.env ?? {} }
  }
  return out
}
