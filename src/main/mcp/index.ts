// Owner: agent "mcp-quick". MCP config + status, desktop extensions, skills.
import { BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import type { McpServerConfig, McpServerEntry, McpServerStatus } from '@shared/ipc'
import { bus } from '../core/bus'
import { emit, handle } from '../core/ipc'
import { log } from '../core/log'
import { configPath, ensureConfigFile, entrySchema, importFromClaudeDesktop, loadServers, removeServer, serverNameSchema, upsertServer } from './config'
import {
  extensionServers, extensionsFolder, installExtension, listExtensions, loadExtensions, previewExtension,
  removeExtension, setExtensionConfig, setExtensionEnabled
} from './extensions'
import { probeServer } from './probe'
import { createSkill, deleteSkill, installSkillArchive, listSkills, readSkill, saveSkill } from './skills'

/** Something we can probe: a user-configured server or an installed extension's server. */
interface Target { name: string; config: McpServerConfig; enabled: boolean; reason?: string }

let servers: McpServerEntry[] = []
let targets: Target[] = []
const statuses = new Map<string, McpServerStatus>()
const generation = new Map<string, number>() // drops stale probe results after edits/reloads

/** User config wins over an extension with the same name. */
function computeTargets(): Target[] {
  const taken = new Set(servers.map((s) => s.name))
  return [
    ...servers.map((s) => ({ name: s.name, config: s.config, enabled: s.enabled })),
    ...extensionServers().filter((e) => !taken.has(e.name))
  ]
}

function idleStatus(t: Target): McpServerStatus {
  return t.reason ? { name: t.name, status: 'failed', error: t.reason } : { name: t.name, status: 'disabled' }
}

function statusList(): McpServerStatus[] {
  return targets.map((t) => statuses.get(t.name) ?? (t.enabled ? { name: t.name, status: 'pending' } : idleStatus(t)))
}

const broadcast = (): void => emit('mcp:changed', statusList())
const broadcastExtensions = (): void => emit('ext:changed', listExtensions())

async function test(name: string): Promise<McpServerStatus> {
  const target = targets.find((t) => t.name === name)
  if (!target) throw new Error(`Unknown MCP server "${name}"`)
  if (!target.enabled) return statuses.get(name) ?? idleStatus(target)
  const gen = (generation.get(name) ?? 0) + 1
  generation.set(name, gen)
  statuses.set(name, { name, status: 'pending', tools: statuses.get(name)?.tools })
  broadcast()
  const result = await probeServer(name, target.config)
  if (generation.get(name) === gen && targets.some((t) => t.name === name)) {
    statuses.set(name, result)
    broadcast()
  }
  return result
}

const testInBackground = (name: string): void => { void test(name).catch((e) => log.warn(`[mcp] test ${name} failed`, e)) }

/** Re-reads config + extensions; probes targets whose config changed (or all when `retestAll`). */
function refresh(retestAll: boolean): void {
  const before = new Map(targets.map((t) => [t.name, JSON.stringify(t)]))
  servers = loadServers()
  targets = computeTargets()
  for (const name of [...statuses.keys()]) if (!targets.some((t) => t.name === name)) { statuses.delete(name); generation.delete(name) }
  for (const t of targets) {
    const changed = before.get(t.name) !== JSON.stringify(t)
    if (!t.enabled) { generation.set(t.name, (generation.get(t.name) ?? 0) + 1); statuses.set(t.name, idleStatus(t)) }
    else if (retestAll || changed) testInBackground(t.name)
  }
  bus.emitBus('mcp:config-changed', undefined)
  broadcast()
}

function onExtensionsChanged(): void {
  refresh(false)
  broadcastExtensions()
}

const idSchema = z.string().regex(/^[\w.-]+$/)
const pathSchema = z.string().min(1).refine((p) => p.startsWith('/'), 'Expected an absolute path')
const userConfigSchema = z.record(z.string(), z.unknown())

async function pickExtensionFile(): Promise<string | null> {
  const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Desktop Extension', extensions: ['mcpb', 'dxt'] }] }
  const win = BrowserWindow.getFocusedWindow()
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return r.canceled ? null : (r.filePaths[0] ?? null)
}

export function registerMcp(): void {
  servers = loadServers()
  targets = computeTargets()
  log.info(`[mcp] loaded ${servers.length} server(s) from ${configPath()}`)
  for (const t of targets) if (!t.enabled) statuses.set(t.name, idleStatus(t))
  for (const t of targets) if (t.enabled) testInBackground(t.name)
  void loadExtensions().then(onExtensionsChanged, (e) => log.error('[ext] load failed', e))

  handle('mcp:list', () => ({ configPath: configPath(), servers }))
  handle('mcp:status', () => statusList())
  handle('mcp:test', (name) => test(z.string().min(1).parse(name)))
  handle('mcp:upsert', (entry, previousName) => {
    const parsed = entrySchema.parse(entry) as McpServerEntry
    const prev = previousName === undefined ? undefined : serverNameSchema.parse(previousName)
    if (prev === undefined && servers.some((s) => s.name === parsed.name)) throw new Error(`A server named "${parsed.name}" already exists`)
    upsertServer(parsed, prev)
    if (prev && prev !== parsed.name) { statuses.delete(prev); generation.delete(prev) }
    refresh(false)
  })
  handle('mcp:remove', (name) => { removeServer(serverNameSchema.parse(name)); refresh(false) })
  handle('mcp:reload', async () => {
    await loadExtensions()
    refresh(true)
    broadcastExtensions()
  })
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
    if (result.imported.length) refresh(false)
    return result
  })

  handle('ext:list', () => listExtensions())
  handle('ext:preview', (filePath) => previewExtension(pathSchema.parse(filePath)))
  handle('ext:pickFile', () => pickExtensionFile())
  handle('ext:install', async (opts) => {
    const o = z.object({ filePath: pathSchema, userConfig: userConfigSchema.optional() }).parse(opts)
    const ext = await installExtension(o.filePath, o.userConfig)
    statuses.delete(ext.name) // force a fresh probe of the new version
    onExtensionsChanged()
    return ext
  })
  handle('ext:setEnabled', (id, enabled) => { setExtensionEnabled(idSchema.parse(id), z.boolean().parse(enabled)); onExtensionsChanged() })
  handle('ext:setConfig', (id, userConfig) => {
    const ext = setExtensionConfig(idSchema.parse(id), userConfigSchema.parse(userConfig))
    onExtensionsChanged()
    return ext
  })
  handle('ext:remove', (id) => { removeExtension(idSchema.parse(id)); onExtensionsChanged() })
  handle('ext:openFolder', async () => {
    const err = await shell.openPath(extensionsFolder())
    if (err) throw new Error(err)
  })

  handle('skills:list', (cwd) => listSkills(z.string().optional().parse(cwd)))
  handle('skills:create', (opts) => createSkill(z.object({
    name: z.string().trim().min(1).max(64), description: z.string().max(1024), body: z.string().max(500_000),
    scope: z.enum(['user', 'project']), cwd: pathSchema.optional()
  }).parse(opts)))
  handle('skills:read', (path) => readSkill(pathSchema.parse(path)))
  handle('skills:save', (path, content) => saveSkill(pathSchema.parse(path), z.string().max(500_000).parse(content)))
  handle('skills:delete', (path) => deleteSkill(pathSchema.parse(path)))
  handle('skills:installArchive', (filePath) => installSkillArchive(pathSchema.parse(filePath)))
}

/** Enabled MCP servers (user config + extensions) in Agent SDK `mcpServers` shape. Called by sessions-core on every session start. */
export function getEnabledMcpServers(): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}
  for (const t of targets) {
    if (!t.enabled) continue
    const c = t.config
    out[t.name] = 'url' in c
      ? { type: c.type, url: c.url, headers: c.headers ?? {} }
      : { type: 'stdio', command: c.command, args: c.args ?? [], env: c.env ?? {} }
  }
  return out
}
