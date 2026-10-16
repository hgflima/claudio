// Discovers Claude Code skills (SKILL.md) from user, project and installed plugin folders.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { SkillInfo } from '@shared/ipc'
import { readJson } from '../core/store'

function unquote(v: string): string {
  const t = v.trim()
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

