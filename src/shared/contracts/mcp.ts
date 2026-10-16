// Owner: agent "mcp-quick". MCP servers config/status, skills listing, Quick Entry window.
import type { Attachment } from './sessions'

export type McpServerConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }

export interface McpServerEntry { name: string; config: McpServerConfig; enabled: boolean }
export interface McpServerStatus { name: string; status: 'disabled' | 'pending' | 'connected' | 'failed' | 'needs-auth'; error?: string; tools?: string[]; checkedAt?: number }
export interface SkillInfo { name: string; description: string; path: string; source: 'user' | 'project' | 'plugin' }

export interface McpInvoke {
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
  'mcp:changed': McpServerStatus[]
  'quick:submitted': { text: string; attachments?: Attachment[]; cwd: string | null } // sent to MAIN window renderer
  'quick:shown': void // sent to quick window renderer, focus input & reset
}
