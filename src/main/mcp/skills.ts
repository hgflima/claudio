// Discovers Claude Code skills (SKILL.md) from user, project and installed plugin folders.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { SkillInfo } from '@shared/ipc'
import { log } from '../core/log'
import { readJson } from '../core/store'
import { assertFile, extractToStaging, slugify, walk } from './archive'

function unquote(v: string): string {
  const t = v.trim()
  if (t.startsWith('"') && t.endsWith('"')) { try { return String(JSON.parse(t)) } catch { /* fall through */ } }
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t
}

/** Minimal YAML frontmatter reader for top-level scalar keys (incl. `>`/`|` block scalars). */
export function parseFrontmatter(src: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src)
  if (!m) return {}
  const out: Record<string, string> = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    const [, key, rest] = kv
    if (/^[>|][+-]?$/.test(rest.trim())) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
      out[key] = block.join(rest.trim().startsWith('>') ? ' ' : '\n').trim()
    } else {
      out[key] = unquote(rest)
    }
  }
  return out
}

function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

function readSkillsDir(dir: string, source: SkillInfo['source'], prefix = ''): SkillInfo[] {
  if (!isDir(dir)) return []
  const out: SkillInfo[] = []
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry, 'SKILL.md')
    if (!existsSync(file)) continue
    try {
      const fm = parseFrontmatter(readFileSync(file, 'utf8'))
      out.push({ name: `${prefix}${fm.name || entry}`, description: fm.description ?? '', path: file, source })
    } catch { /* unreadable skill: skip */ }
  }
  return out
}

interface InstalledPlugins { plugins?: Record<string, { installPath?: string }[]> }

function pluginSkills(): SkillInfo[] {
  const root = join(homedir(), '.claude/plugins')
  const installed = readJson<InstalledPlugins>(join(root, 'installed_plugins.json'), {})
  const out: SkillInfo[] = []
  const seen = new Set<string>()
  for (const [id, installs] of Object.entries(installed.plugins ?? {})) {
    const plugin = id.split('@')[0]
    for (const inst of installs ?? []) {
      if (!inst.installPath || seen.has(inst.installPath)) continue
      seen.add(inst.installPath)
      out.push(...readSkillsDir(join(inst.installPath, 'skills'), 'plugin', `${plugin}:`))
    }
  }
  // Synced (account-managed) plugins live outside installed_plugins.json: synced/<id>/<plugin>/skills/*
  const synced = join(root, 'synced')
  if (isDir(synced)) {
    for (const bundle of readdirSync(synced)) {
      const bundleDir = join(synced, bundle)
      if (!isDir(bundleDir)) continue
      for (const plugin of readdirSync(bundleDir)) out.push(...readSkillsDir(join(bundleDir, plugin, 'skills'), 'plugin', `${plugin}:`))
    }
  }
  return out
}

export function listSkills(cwd?: string): SkillInfo[] {
  const user = readSkillsDir(join(homedir(), '.claude/skills'), 'user')
  const project = cwd && isAbsolute(cwd) ? readSkillsDir(join(cwd, '.claude/skills'), 'project') : []
  const all = [...user, ...project, ...pluginSkills()]
  const byPath = new Map(all.map((s) => [s.path, s]))
  return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name))
}


// ---------- CRUD (user: ~/.claude/skills, project: <cwd>/.claude/skills; plugin skills are read-only) ----------
const userSkillsDir = () => join(homedir(), '.claude/skills')
const pluginsDir = () => join(homedir(), '.claude/plugins')
const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024

function inside(root: string, p: string): boolean {
  const rel = relative(root, p)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Ensures `path` is `<dir>/.claude/skills/<name>/SKILL.md` (user or project scope) and returns its skill folder. */
function editableSkillDir(path: string): string {
  const file = resolve(path)
  if (file !== path || basename(file) !== 'SKILL.md') throw new Error('Not a SKILL.md path')
  const dir = dirname(file)
  const skillsDir = dirname(dir)
  if (basename(skillsDir) !== 'skills' || basename(dirname(skillsDir)) !== '.claude') throw new Error('Skills can only be edited inside ~/.claude/skills or <project>/.claude/skills')
  if (inside(pluginsDir(), file)) throw new Error('Plugin skills are read-only')
  return dir
}

function readableSkill(path: string): string {
  const file = resolve(path)
  if (file !== path || basename(file) !== 'SKILL.md') throw new Error('Not a SKILL.md path')
  if (inside(pluginsDir(), file)) return file
  editableSkillDir(file)
  return file
}

const yamlString = (s: string): string => JSON.stringify(s.replace(/\r?\n/g, ' ').trim())

function skillInfo(file: string, source: SkillInfo['source']): SkillInfo {
  const fm = parseFrontmatter(readFileSync(file, 'utf8'))
  return { name: fm.name || basename(dirname(file)), description: fm.description ?? '', path: file, source }
}

export function createSkill(o: { name: string; description: string; body: string; scope: 'user' | 'project'; cwd?: string }): SkillInfo {
  const slug = slugify(o.name)
  if (!slug) throw new Error('Name must contain letters or numbers')
  let root = userSkillsDir()
  if (o.scope === 'project') {
    if (!o.cwd || !isAbsolute(o.cwd) || !statSync(o.cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error('A project folder is required for project skills')
    root = join(o.cwd, '.claude/skills')
  }
  const dir = join(root, slug)
  if (existsSync(dir)) throw new Error(`A skill named "${slug}" already exists`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  const body = o.body.trim() ? `${o.body.trim()}\n` : ''
  writeFileSync(file, `---\nname: ${slug}\ndescription: ${yamlString(o.description)}\n---\n\n${body}`)
  log.info(`[skills] created ${file}`)
  return skillInfo(file, o.scope)
}

export function readSkill(path: string): string {
  return readFileSync(readableSkill(path), 'utf8')
}

export function saveSkill(path: string, content: string): void {
  editableSkillDir(path)
  if (!existsSync(path)) throw new Error('Skill not found')
  writeFileSync(path, content)
}

export function deleteSkill(path: string): void {
  const dir = editableSkillDir(path)
  if (lstatSync(dir).isSymbolicLink()) unlinkSync(dir)
  else rmSync(dir, { recursive: true, force: true })
  log.info(`[skills] deleted ${dir}`)
}

const FORBIDDEN = new Set(['hooks', 'commands', 'agents', '.mcp.json', 'hooks.json', '.claude-plugin'])

/** Installs a .skill/.zip containing exactly one SKILL.md into ~/.claude/skills/<name>. */
export async function installSkillArchive(filePath: string): Promise<SkillInfo> {
  assertFile(filePath, ['.skill', '.zip'], MAX_ARCHIVE_BYTES)
  const staging = await extractToStaging(filePath)
  try {
    const all = walk(staging)
    const bad = all.find((p) => FORBIDDEN.has(basename(p)))
    if (bad) throw new Error(`Archive contains "${relative(staging, bad)}" — only plain skills can be installed (no hooks, commands, agents or MCP config)`)
    const skillFiles = all.filter((p) => basename(p) === 'SKILL.md')
    if (skillFiles.length !== 1) throw new Error(skillFiles.length ? 'Archive contains more than one SKILL.md' : 'Archive does not contain a SKILL.md')
    const src = dirname(skillFiles[0])
    const fm = parseFrontmatter(readFileSync(skillFiles[0], 'utf8'))
    const slug = slugify(fm.name || (src === staging ? basename(filePath).replace(/\.(skill|zip)$/i, '') : basename(src)))
    if (!slug) throw new Error('Could not determine the skill name')
    const dest = join(userSkillsDir(), slug)
    if (existsSync(dest)) throw new Error(`A skill named "${slug}" is already installed`)
    mkdirSync(userSkillsDir(), { recursive: true })
    renameSync(src, dest)
    log.info(`[skills] installed ${slug} from ${filePath}`)
    return skillInfo(join(dest, 'SKILL.md'), 'user')
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
