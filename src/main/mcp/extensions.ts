// Desktop extensions (.mcpb/.dxt, manifest 0.1–0.4): preview, install, user_config, and MCP server resolution.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { safeStorage } from 'electron'
import { z } from 'zod'
import type { ExtensionInfo, ExtensionPreview, ExtUserConfigField, McpServerConfig } from '@shared/ipc'
import { log } from '../core/log'
import { getShellEnv } from '../core/shellEnv'
import { dataPath, readJson, writeJson } from '../core/store'
import { assertFile, extractToStaging, slugify } from './archive'

const run = promisify(execFile)
const MAX_EXTENSION_BYTES = 512 * 1024 * 1024
const ENCRYPTED = '__encrypted__:'
export const MASK = '••••••'

// ---------- manifest ----------
const mcpConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  platform_overrides: z.record(z.string(), z.object({ command: z.string().optional(), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional() })).optional()
})

const userConfigFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'directory', 'file']),
  title: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  multiple: z.boolean().optional(),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional()
})

const manifestSchema = z.object({
  manifest_version: z.string().optional(),
  dxt_version: z.string().optional(),
  name: z.string().min(1),
  display_name: z.string().optional(),
  version: z.string().min(1),
  description: z.string().default(''),
  author: z.union([z.string(), z.object({ name: z.string(), email: z.string().optional(), url: z.string().optional() })]).optional(),
  icon: z.string().optional(),
  server: z.object({
    type: z.enum(['node', 'python', 'binary', 'uv']),
    entry_point: z.string().optional(),
    mcp_config: mcpConfigSchema.optional()
  }),
  tools: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
  compatibility: z.object({
    platforms: z.array(z.string()).optional(),
    runtimes: z.object({ node: z.string().optional(), python: z.string().optional() }).optional(),
    claude_desktop: z.string().optional()
  }).optional(),
  user_config: z.record(z.string(), userConfigFieldSchema).optional()
}).refine((m) => /^0\.[1-4]$/.test(m.manifest_version ?? m.dxt_version ?? ''), { message: 'Unsupported manifest_version (expected 0.1–0.4)' })
  .refine((m) => m.server.mcp_config || m.server.entry_point, { message: 'server.mcp_config or server.entry_point is required' })

type Manifest = z.infer<typeof manifestSchema>

function readManifest(dir: string): Manifest {
  const file = join(dir, 'manifest.json')
  if (!existsSync(file)) throw new Error('manifest.json not found at the root of the extension')
  let raw: unknown
  try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('manifest.json is not valid JSON') }
  const r = manifestSchema.safeParse(raw)
  if (!r.success) throw new Error(`Invalid manifest: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
  return r.data
}

const extId = (m: Manifest): string => `local.mcpb.${slugify(m.name) || 'extension'}`

function within(root: string, p: string): boolean {
  const rel = relative(root, p)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function iconDataUrl(dir: string, m: Manifest): string | undefined {
  if (!m.icon) return undefined
  const file = resolve(dir, m.icon)
  if (!within(dir, file) || !existsSync(file)) return undefined
  const ext = file.toLowerCase().split('.').pop()
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
  if (statSync(file).size > 1024 * 1024) return undefined
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`
}

function schemaFields(m: Manifest): ExtUserConfigField[] {
  return Object.entries(m.user_config ?? {}).map(([key, f]) => ({
    key, type: f.type, title: f.title ?? key, description: f.description, required: f.required, sensitive: f.sensitive,
    multiple: f.multiple, default: f.default, min: f.min, max: f.max
  }))
}

// ---------- compatibility ----------
const runtimeVersions = new Map<string, Promise<string | null>>()

function runtimeVersion(cmd: string): Promise<string | null> {
  if (!runtimeVersions.has(cmd)) {
    runtimeVersions.set(cmd, (async () => {
      try {
        const { stdout, stderr } = await run(cmd, ['--version'], { env: await getShellEnv(), timeout: 5000 })
        return /(\d+\.\d+(?:\.\d+)?)/.exec(stdout || stderr)?.[1] ?? '0.0.0'
      } catch { return null }
    })())
  }
  return runtimeVersions.get(cmd)!
}

const parts = (v: string): number[] => v.replace(/^[v=]/, '').split('.').map((n) => parseInt(n, 10) || 0)
function cmp(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Minimal semver range check: space-separated comparators (>=, >, <=, <, =, ^, ~). Unknown syntax passes. */
export function satisfies(version: string, range: string): boolean {
  for (const alt of range.split('||')) {
    const ok = alt.trim().split(/\s+/).filter(Boolean).every((c) => {
      const m = /^(>=|<=|>|<|=|\^|~)?\s*v?(\d+(?:\.\d+){0,2})/.exec(c)
      if (!m) return true
      const [, op = '=', v] = m
      const d = cmp(version, v)
      if (op === '>=' || op === '^' || op === '~') return d >= 0 && (op !== '^' || parts(version)[0] === parts(v)[0])
      if (op === '>') return d > 0
      if (op === '<=') return d <= 0
      if (op === '<') return d < 0
      return v.split('.').length < 3 ? cmp(version, v) >= 0 && parts(version)[0] === parts(v)[0] : d === 0
    })
    if (ok) return true
  }
  return false
}

async function checkCompat(m: Manifest): Promise<{ ok: boolean; reason?: string }> {
  const platforms = m.compatibility?.platforms
  if (platforms?.length && !platforms.includes(process.platform)) return { ok: false, reason: `Not available on ${process.platform} (supports ${platforms.join(', ')})` }
  const needs: { label: string; cmd: string; range?: string }[] = []
  if (m.server.type === 'node') needs.push({ label: 'Node.js', cmd: 'node', range: m.compatibility?.runtimes?.node })
  if (m.server.type === 'python') needs.push({ label: 'Python', cmd: 'python3', range: m.compatibility?.runtimes?.python })
  if (m.server.type === 'uv') needs.push({ label: 'uv', cmd: 'uv' })
  for (const n of needs) {
    const v = await runtimeVersion(n.cmd)
    if (!v) return { ok: false, reason: `Requires ${n.label}, which was not found in your shell PATH` }
    if (n.range && !satisfies(v, n.range)) return { ok: false, reason: `Requires ${n.label} ${n.range} (found ${v})` }
  }
  return { ok: true }
}

// ---------- settings (enabled + user_config, sensitive values encrypted) ----------
interface ExtSettings { enabled: boolean; userConfig: Record<string, unknown> }
const settingsFile = (id: string) => dataPath('extensions-settings', `${id}.json`)

function encrypt(v: string): string {
  if (!safeStorage.isEncryptionAvailable()) { log.warn('[ext] safeStorage unavailable; storing sensitive value unencrypted'); return v }
  return ENCRYPTED + safeStorage.encryptString(v).toString('base64')
}
function decrypt(v: unknown): unknown {
  if (typeof v !== 'string' || !v.startsWith(ENCRYPTED)) return v
  try { return safeStorage.decryptString(Buffer.from(v.slice(ENCRYPTED.length), 'base64')) } catch (e) { log.warn('[ext] could not decrypt value', e); return undefined }
}

const readSettings = (id: string): ExtSettings => ({ enabled: true, userConfig: {}, ...readJson<Partial<ExtSettings>>(settingsFile(id), {}) })

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** Validates renderer input against the schema; masked sensitive values keep the stored secret. Returns the value to persist. */
function normalizeConfig(fields: ExtUserConfigField[], input: Record<string, unknown>, stored: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    let v = input[f.key]
    if (f.sensitive && v === MASK) { if (stored[f.key] !== undefined) out[f.key] = stored[f.key]; continue }
    if (isEmpty(v)) continue
    const one = (x: unknown): unknown => {
      if (f.type === 'number') {
        const n = typeof x === 'number' ? x : Number(x)
        if (!Number.isFinite(n)) throw new Error(`${f.title}: must be a number`)
        if (f.min !== undefined && n < f.min) throw new Error(`${f.title}: must be ≥ ${f.min}`)
        if (f.max !== undefined && n > f.max) throw new Error(`${f.title}: must be ≤ ${f.max}`)
        return n
      }
      if (f.type === 'boolean') return x === true || x === 'true'
      if (typeof x !== 'string') throw new Error(`${f.title}: must be text`)
      if ((f.type === 'directory' || f.type === 'file') && !isAbsolute(x)) throw new Error(`${f.title}: must be an absolute path`)
      return x
    }
    if (f.multiple) v = (Array.isArray(v) ? v : [v]).map(one)
    else v = one(Array.isArray(v) ? v[0] : v)
    out[f.key] = f.sensitive ? (Array.isArray(v) ? v.map((x) => encrypt(String(x))) : encrypt(String(v))) : v
  }
  return out
}

function missingRequired(fields: ExtUserConfigField[], cfg: Record<string, unknown>): string[] {
  return fields.filter((f) => f.required && isEmpty(cfg[f.key]) && isEmpty(f.default)).map((f) => f.title)
}

// ---------- installed extensions ----------
interface Installed { id: string; dir: string; manifest: Manifest; settings: ExtSettings; compat: { ok: boolean; reason?: string } }
let installed: Installed[] = []
const extensionsRoot = () => dataPath('extensions')

export async function loadExtensions(): Promise<void> {
  const root = extensionsRoot()
  const next: Installed[] = []
  if (existsSync(root)) {
    for (const id of readdirSync(root)) {
      const dir = join(root, id)
      try {
        const manifest = readManifest(dir)
        next.push({ id, dir, manifest, settings: readSettings(id), compat: await checkCompat(manifest) })
      } catch (e) { log.warn(`[ext] skipping ${id}: ${e instanceof Error ? e.message : String(e)}`) }
    }
  }
  installed = next.sort((a, b) => (a.manifest.display_name ?? a.manifest.name).localeCompare(b.manifest.display_name ?? b.manifest.name))
}

function info(x: Installed): ExtensionInfo {
  const fields = schemaFields(x.manifest)
  const userConfig: Record<string, unknown> = {}
  for (const f of fields) {
    const v = x.settings.userConfig[f.key]
    if (v !== undefined) userConfig[f.key] = f.sensitive ? MASK : v
  }
  return {
    ...manifestInfo(x.dir, x.manifest, x.compat), path: x.dir, enabled: x.settings.enabled, userConfig
  }
}

function manifestInfo(dir: string, m: Manifest, compat: { ok: boolean; reason?: string }): ExtensionPreview['manifest'] {
  return {
    id: extId(m), name: m.name, displayName: m.display_name ?? m.name, version: m.version, description: m.description,
    author: typeof m.author === 'string' ? m.author : m.author?.name, iconDataUrl: iconDataUrl(dir, m),
    userConfigSchema: schemaFields(m), compatibility: compat, tools: m.tools
  }
}

export const listExtensions = (): ExtensionInfo[] => installed.map(info)

function find(id: string): Installed {
  const x = installed.find((e) => e.id === id)
  if (!x) throw new Error(`Unknown extension "${id}"`)
  return x
}

export async function previewExtension(filePath: string): Promise<ExtensionPreview> {
  assertFile(filePath, ['.mcpb', '.dxt'], MAX_EXTENSION_BYTES)
  const staging = await extractToStaging(filePath)
  try {
    const m = readManifest(staging)
    const preview: ExtensionPreview = { filePath, manifest: manifestInfo(staging, m, await checkCompat(m)) }
    const existing = installed.find((e) => e.id === extId(m))
    if (existing) preview.alreadyInstalledVersion = existing.manifest.version
    return preview
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export async function installExtension(filePath: string, userConfig: Record<string, unknown> = {}): Promise<ExtensionInfo> {
  assertFile(filePath, ['.mcpb', '.dxt'], MAX_EXTENSION_BYTES)
  const staging = await extractToStaging(filePath)
  try {
    const m = readManifest(staging)
    const compat = await checkCompat(m)
    if (!compat.ok) throw new Error(compat.reason)
    const id = extId(m)
    const fields = schemaFields(m)
    const prev = existsSync(settingsFile(id)) ? readSettings(id) : { enabled: true, userConfig: {} }
    const cfg = { ...prev.userConfig, ...normalizeConfig(fields, userConfig, prev.userConfig) }
    const missing = missingRequired(fields, cfg)
    if (missing.length) throw new Error(`Missing required settings: ${missing.join(', ')}`)
    const dest = join(extensionsRoot(), id)
    mkdirSync(extensionsRoot(), { recursive: true })
    rmSync(dest, { recursive: true, force: true })
    renameSync(staging, dest)
    writeJson(settingsFile(id), { enabled: prev.enabled, userConfig: cfg })
    log.info(`[ext] installed ${id}@${m.version}`)
    await loadExtensions()
    return info(find(id))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export function setExtensionEnabled(id: string, enabled: boolean): void {
  const x = find(id)
  x.settings = { ...x.settings, enabled }
  writeJson(settingsFile(id), x.settings)
}

export function setExtensionConfig(id: string, userConfig: Record<string, unknown>): ExtensionInfo {
  const x = find(id)
  const cfg = normalizeConfig(schemaFields(x.manifest), userConfig, x.settings.userConfig)
  x.settings = { ...x.settings, userConfig: cfg }
  writeJson(settingsFile(id), x.settings)
  return info(x)
}

export function removeExtension(id: string): void {
  const x = find(id)
  rmSync(x.dir, { recursive: true, force: true })
  rmSync(settingsFile(id), { force: true })
  installed = installed.filter((e) => e.id !== id)
  log.info(`[ext] removed ${id}`)
}

export function extensionsFolder(): string {
  mkdirSync(extensionsRoot(), { recursive: true })
  return extensionsRoot()
}

// ---------- MCP server resolution ----------
let shellPath: string | undefined
void getShellEnv().then((env) => { shellPath = env.PATH })

/** Absolute path of a bare command using the login-shell PATH (falls back to the bare name until it resolves). */
function resolveCommand(cmd: string): string {
  if (isAbsolute(cmd) || cmd.includes('/') || !shellPath) return cmd
  for (const d of shellPath.split(delimiter)) {
    const p = join(d, cmd)
    if (d && existsSync(p)) return p
  }
  return cmd
}

function substitute(s: string, dir: string, cfg: Record<string, unknown>): string {
  return s.replace(/\$\{([^}]+)\}/g, (whole, key: string) => {
    if (key === '__dirname') return dir
    if (key === 'HOME') return homedir()
    if (key === '/' || key === 'pathSeparator') return sep
    if (key.startsWith('user_config.')) {
      const v = cfg[key.slice('user_config.'.length)]
      return v === undefined ? '' : Array.isArray(v) ? v.join(',') : String(v)
    }
    return whole
  })
}

function effectiveConfig(x: Installed): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of schemaFields(x.manifest)) {
    const stored = x.settings.userConfig[f.key]
    const v = stored !== undefined ? (Array.isArray(stored) ? stored.map(decrypt) : decrypt(stored)) : f.default
    if (v !== undefined) out[f.key] = typeof v === 'string' ? substitute(v, x.dir, {}) : v
  }
  return out
}

function serverConfig(x: Installed): McpServerConfig {
  const { server } = x.manifest
  const cfg = effectiveConfig(x)
  const entry = server.entry_point ?? ''
  const base = server.mcp_config ?? (
    server.type === 'node' ? { command: 'node', args: ['${__dirname}/' + entry] }
      : server.type === 'python' ? { command: 'python3', args: ['${__dirname}/' + entry] }
        : server.type === 'uv' ? { command: 'uv', args: ['run', '--directory', '${__dirname}', entry] }
          : { command: '${__dirname}/' + entry }
  )
  const o = server.mcp_config?.platform_overrides?.[process.platform]
  const command = o?.command ?? base.command
  const rawArgs = o?.args ?? base.args ?? []
  const env = { ...(base.env ?? {}), ...(o?.env ?? {}) }
  const args = rawArgs.flatMap((a) => {
    const whole = /^\$\{user_config\.([^}]+)\}$/.exec(a)
    const v = whole ? cfg[whole[1]] : undefined
    return Array.isArray(v) ? v.map(String) : [substitute(a, x.dir, cfg)]
  })
  return {
    type: 'stdio',
    command: resolveCommand(substitute(command, x.dir, cfg)),
    args,
    env: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, substitute(v, x.dir, cfg)]))
  }
}

export interface ExtensionServer { name: string; extensionId: string; config: McpServerConfig; enabled: boolean; reason?: string }

/** One MCP server per installed extension; `enabled` only when on, compatible and fully configured. */
export function extensionServers(): ExtensionServer[] {
  return installed.map((x) => {
    const missing = missingRequired(schemaFields(x.manifest), x.settings.userConfig)
    const reason = !x.compat.ok ? x.compat.reason : missing.length ? `Missing required settings: ${missing.join(', ')}` : undefined
    return { name: x.manifest.name, extensionId: x.id, config: serverConfig(x), enabled: x.settings.enabled && !reason, reason }
  })
}
