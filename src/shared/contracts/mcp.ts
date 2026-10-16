// Owner: agent "mcp-quick". MCP servers config/status, skills listing, Quick Entry window.
import type { Attachment } from './sessions'

export type McpServerConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }

export interface McpServerEntry { name: string; config: McpServerConfig; enabled: boolean }
export interface McpServerStatus { name: string; status: 'disabled' | 'pending' | 'connected' | 'failed' | 'needs-auth'; error?: string; tools?: string[]; checkedAt?: number }
export interface SkillInfo { name: string; description: string; path: string; source: 'user' | 'project' | 'plugin' }

// ---- Phase 2: Desktop extensions (.mcpb/.dxt, manifest 0.1–0.4) ----
export interface ExtUserConfigField {
  key: string; type: 'string' | 'number' | 'boolean' | 'directory' | 'file'; title: string; description?: string
  required?: boolean; sensitive?: boolean; multiple?: boolean; default?: unknown; min?: number; max?: number
}
export interface ExtensionInfo {
  id: string; name: string; displayName: string; version: string; description: string; author?: string
  iconDataUrl?: string; path: string; enabled: boolean
  userConfigSchema: ExtUserConfigField[]
  userConfig: Record<string, unknown> // sensitive values are returned as '••••••' when set
  compatibility: { ok: boolean; reason?: string }
  tools?: { name: string; description?: string }[]
}
export interface ExtensionPreview { filePath: string; manifest: Omit<ExtensionInfo, 'path' | 'enabled' | 'userConfig'>; alreadyInstalledVersion?: string }

export interface McpInvoke {
  'ext:list': () => ExtensionInfo[]
  'ext:preview': (filePath: string) => ExtensionPreview
  'ext:pickFile': () => string | null
  'ext:install': (opts: { filePath: string; userConfig?: Record<string, unknown> }) => ExtensionInfo
  'ext:setEnabled': (id: string, enabled: boolean) => void
  'ext:setConfig': (id: string, userConfig: Record<string, unknown>) => ExtensionInfo
  'ext:remove': (id: string) => void
  'ext:openFolder': () => void
  // ---- Phase 2: Skills CRUD (user scope ~/.claude/skills, project scope <cwd>/.claude/skills) ----
  'skills:create': (opts: { name: string; description: string; body: string; scope: 'user' | 'project'; cwd?: string }) => SkillInfo
  'skills:read': (path: string) => string // full SKILL.md
  'skills:save': (path: string, content: string) => void
  'skills:delete': (path: string) => void
  'skills:installArchive': (filePath: string) => SkillInfo // .skill / .zip with exactly one SKILL.md

  'mcp:list': () => { configPath: string; servers: McpServerEntry[] }
  'mcp:upsert': (entry: McpServerEntry, previousName?: string) => void
  'mcp:remove': (name: string) => void
  'mcp:reload': () => void
  'mcp:status': () => McpServerStatus[]
  'mcp:test': (name: string) => McpServerStatus
  'mcp:openConfig': () => void
  'mcp:openLogs': () => void
  'mcp:importClaudeDesktop': () => { imported: string[]; skipped: string[] }
  'skills:list': (cwd?: string) => SkillInfo[]
  'quick:submit': (q: { text: string; attachments?: Attachment[]; cwd: string | null }) => void
  'quick:dismiss': () => void
  'quick:shortcutStatus': () => { accelerator: string; registered: boolean; error?: 'invalid-accelerator' | 'registration-failed' }
  'quick:getContext': () => { recentFolders: string[] }
}

export interface McpEvents {
  'ext:changed': ExtensionInfo[]
  'ext:openRequested': { filePath: string } // shell routes .mcpb/.dxt opened from Finder → renderer shows install dialog
  'skills:openRequested': { filePath: string } // shell routes .skill files

  'mcp:changed': McpServerStatus[]
  'quick:submitted': { text: string; attachments?: Attachment[]; cwd: string | null } // sent to MAIN window renderer
  'quick:shown': void // sent to quick window renderer, focus input & reset
}
