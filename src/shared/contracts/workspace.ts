// Owner: agent "panels". Terminal (node-pty), git status/diff, file search for @mentions.
export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | '?'
export interface GitStatus {
  isRepo: boolean
  branch: string | null
  ahead?: number
  behind?: number
  files: { path: string; status: GitFileStatus; staged: boolean; additions?: number; deletions?: number }[]
}

export interface WorkspaceInvoke {
  'terminal:create': (opts: { cwd: string; cols: number; rows: number; key?: string }) => { ptyId: string; reused: boolean }
  'terminal:write': (ptyId: string, data: string) => void
  'terminal:resize': (ptyId: string, cols: number, rows: number) => void
  'terminal:kill': (ptyId: string) => void
  'git:status': (cwd: string) => GitStatus
  'git:diff': (opts: { cwd: string; path?: string; staged?: boolean }) => string // unified patch
  'files:search': (opts: { cwd: string; query: string; limit?: number }) => { path: string; isDir: boolean }[]
}

export interface WorkspaceEvents {
  'terminal:data': { ptyId: string; data: string }
  'terminal:exit': { ptyId: string; exitCode: number }
  'git:changed': { cwd: string } // emitted when a watched repo changes (optional, best effort)
}
