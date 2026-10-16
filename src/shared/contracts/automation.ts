// Phase 2. Owner: agent "automation" (former "panels"). Scheduled tasks.
import type { PermissionMode, SessionKind } from './sessions'

export type TaskSchedule = { type: 'cron'; expr: string } | { type: 'once'; at: number }
export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  schedule: TaskSchedule
  enabled: boolean
  kind: SessionKind
  cwd: string | null
  model: string
  permissionMode: PermissionMode
  useWorktree?: boolean
  createdAt: number
  nextRunAt: number | null
  lastRunAt?: number
  lastSessionId?: string
  lastStatus?: 'running' | 'success' | 'error' | 'skipped'
}
export interface TaskRun { taskId: string; sessionId: string; startedAt: number; finishedAt?: number; status: 'running' | 'success' | 'error' }

export interface AutomationInvoke {
  'tasks:list': () => ScheduledTask[]
  'tasks:upsert': (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'nextRunAt'> & { id?: string }) => ScheduledTask
  'tasks:delete': (id: string) => void
  'tasks:runNow': (id: string) => { sessionId: string }
  'tasks:runs': (id: string) => TaskRun[]
  'tasks:describeCron': (expr: string) => { valid: boolean; next?: number[]; error?: string } // next 3 fire times
}
export interface AutomationEvents {
  'tasks:changed': ScheduledTask[]
}
