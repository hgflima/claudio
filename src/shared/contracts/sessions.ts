// Owners: agent "sessions-core" (main side), agent "sessions-ui" (renderer side).
// The UI never sees raw SDK messages: main normalizes them into TranscriptItem.
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'dontAsk' | 'auto'
export type SessionKind = 'code' | 'chat'
export type SessionStatus = 'idle' | 'running' | 'awaiting-permission' | 'error'

export interface SessionMeta {
  id: string // Claudio id (uuid)
  kind: SessionKind
  title: string
  cwd: string | null // null for chat sessions (main uses a private scratch dir)
  model: string // '' = default
  effort: string // '' = default
  permissionMode: PermissionMode
  status: SessionStatus
  sdkSessionId: string | null // Claude Code session id, used for resume
  createdAt: number
  lastActivityAt: number
  archived: boolean
  importedFrom?: 'cli'
  titleSource?: 'auto' | 'user'
  queued: number // messages waiting to be sent
  worktree?: { path: string; branch: string; baseBranch: string; originCwd: string } | null // phase 2
  forkedFrom?: { sessionId: string; itemId?: string }
  lastError?: string
  usage?: { inputTokens: number; outputTokens: number; costUsd: number; contextTokens?: number }
}

export type Attachment =
  | { type: 'image'; mediaType: string; dataBase64: string; name?: string }
  | { type: 'file'; path: string } // sent as @path mention text

export type TranscriptItem =
  | { id: string; type: 'user'; text: string; attachments?: Attachment[]; createdAt: number }
  | { id: string; type: 'assistant'; text: string; streaming?: boolean; createdAt: number }
  | { id: string; type: 'thinking'; text: string; streaming?: boolean; createdAt: number }
  | { id: string; type: 'tool_use'; toolUseId: string; name: string; input: unknown; createdAt: number; parentToolUseId?: string | null }
  | { id: string; type: 'tool_result'; toolUseId: string; content: string; isError?: boolean; createdAt: number }
  | { id: string; type: 'system'; subtype: 'init' | 'compact' | 'info' | 'error'; text: string; createdAt: number }
  | { id: string; type: 'result'; isError: boolean; durationMs: number; numTurns: number; costUsd?: number; text?: string; createdAt: number }

export interface PermissionRequest {
  sessionId: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
  title?: string // human summary e.g. "Run: npm test"
  suggestedRule?: string // rule used for "always allow", e.g. "Bash(npm test:*)"
  createdAt: number
}

export interface PermissionResponse {
  sessionId: string
  requestId: string
  decision: 'allow' | 'deny'
  scope: 'once' | 'session' | 'always'
  updatedInput?: Record<string, unknown>
  message?: string // deny reason sent to the model
}

export interface ModelInfo { value: string; displayName: string; description?: string }
export interface SlashCommand { name: string; description: string; argumentHint?: string; source: 'builtin' | 'skill' | 'project' | 'user' | 'plugin' | 'mcp' }
export interface CliSessionInfo { cliSessionId: string; cwd: string; title: string; lastActivityAt: number; messageCount: number; alreadyImported: boolean }
export type TrustCheck = { trusted: true } | { trusted: false; blocked?: 'home' | 'root' | 'network' | 'missing'; reason?: string }

export interface SessionsInvoke {
  'sessions:list': (opts?: { includeArchived?: boolean }) => SessionMeta[]
  'sessions:get': (sessionId: string) => SessionMeta | null
  'sessions:create': (opts: { kind: SessionKind; cwd?: string; model?: string; permissionMode?: PermissionMode; effort?: string; title?: string; useWorktree?: boolean; baseBranch?: string }) => SessionMeta
  /** Phase 2: new session continuing from `sessionId` (optionally truncated at a transcript item). */
  'sessions:fork': (opts: { sessionId: string; atItemId?: string }) => SessionMeta
  /** Phase 2: context window usage of the live session, null if unknown. */
  'sessions:contextUsage': (sessionId: string) => { usedTokens: number; maxTokens: number; percent: number } | null
  /** Phase 2: remove the session worktree (git worktree remove) — keeps the branch. */
  'sessions:removeWorktree': (sessionId: string) => void
  'sessions:send': (opts: { sessionId: string; text: string; attachments?: Attachment[] }) => void
  'sessions:interrupt': (sessionId: string) => void
  'sessions:respondPermission': (r: PermissionResponse) => void
  'sessions:pendingPermissions': (sessionId: string) => PermissionRequest[]
  'sessions:update': (opts: { sessionId: string; patch: Partial<Pick<SessionMeta, 'title' | 'model' | 'permissionMode' | 'effort' | 'archived'>> }) => SessionMeta
  'sessions:delete': (sessionId: string) => void
  'sessions:getTranscript': (sessionId: string) => TranscriptItem[]
  'sessions:listModels': () => ModelInfo[]
  'sessions:listCommands': (sessionId: string) => SlashCommand[]
  'sessions:search': (query: string) => { sessionId: string; snippet: string; lastActivityAt: number }[]
  'sessions:listCliSessions': () => CliSessionInfo[]
  'sessions:importCli': (cliSessionIds: string[]) => SessionMeta[]
  'sessions:checkTrust': (cwd: string) => TrustCheck
  'sessions:trustFolder': (cwd: string) => void
  'sessions:runningCount': () => number
}

export interface SessionsEvents {
  'sessions:changed': SessionMeta // upsert
  'sessions:removed': { sessionId: string }
  'sessions:item': { sessionId: string; item: TranscriptItem } // upsert by item.id
  'sessions:delta': { sessionId: string; itemId: string; kind: 'assistant' | 'thinking'; text: string } // append text to streaming item
  'sessions:permission': PermissionRequest
  'sessions:permissionResolved': { sessionId: string; requestId: string }
}
