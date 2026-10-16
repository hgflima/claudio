import { z } from 'zod'
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import type { ScheduledTask } from '@shared/ipc'
import { loadSdk } from '../sessions/sdk'
import { deleteTask, getTask, listTasks, runTaskNow, upsertTask } from './scheduler'

/** Modes the agent may pick for unattended runs. Never escalates beyond `auto`. */
const AGENT_MODES = ['default', 'acceptEdits', 'plan', 'auto'] as const

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (v: unknown): ToolResult => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
const fail = (e: unknown): ToolResult => ({ content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true })

function summarize(t: ScheduledTask) {
  return {
    id: t.id,
    name: t.name,
    prompt: t.prompt,
    schedule: t.schedule.type === 'cron' ? { cron: t.schedule.expr } : { run_at: new Date(t.schedule.at).toISOString() },
    enabled: t.enabled,
    kind: t.kind,
    cwd: t.cwd,
    permissionMode: t.permissionMode,
    nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toISOString() : null,
    lastRunAt: t.lastRunAt ? new Date(t.lastRunAt).toISOString() : null,
    lastStatus: t.lastStatus ?? null
  }
}

function toSchedule(cron?: string, runAt?: string): ScheduledTask['schedule'] | undefined {
  if (cron && runAt) throw new Error('Pass either cron or run_at, not both')
  if (cron) return { type: 'cron', expr: cron }
  if (runAt) {
    const at = Date.parse(runAt)
    if (Number.isNaN(at)) throw new Error('run_at must be an ISO 8601 date-time')
    return { type: 'once', at }
  }
  return undefined
}

async function guarded(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try { return ok(await fn()) } catch (e) { return fail(e) }
}

/**
 * In-process SDK MCP server ("scheduled-tasks") letting the agent create/list/update/delete/run tasks.
 * A fresh instance per call: one McpServer instance can't be connected to several sessions.
 * `defaults.cwd` is used when the agent creates a code task without a cwd (typically the calling session's folder).
 */
export async function getAutomationMcpServer(defaults?: { cwd?: string | null }): Promise<McpSdkServerConfigWithInstance | null> {
  const { createSdkMcpServer, tool } = await loadSdk()
  const cronDesc = '5-field cron expression in the user\'s local timezone, e.g. "0 9 * * 1-5" (weekdays 9:00)'
  const runAtDesc = 'One-off run time, ISO 8601 (e.g. "2026-10-20T15:30:00-03:00")'

  return createSdkMcpServer({
    name: 'scheduled-tasks',
    version: '1.0.0',
    instructions: 'Manage the user\'s Claudio scheduled tasks: prompts that run automatically in a new session on a schedule. Confirm details with the user before creating tasks.',
    tools: [
      tool('list_scheduled_tasks', 'List all scheduled tasks with their schedule, next run and last status.', {}, () =>
        guarded(() => listTasks().map(summarize)), { annotations: { readOnlyHint: true } }),

      tool('create_scheduled_task', 'Create a scheduled task that runs `prompt` in a new session. Provide exactly one of cron or run_at.', {
        name: z.string().describe('Short task name'),
        prompt: z.string().describe('Prompt sent to the new session when the task fires'),
        cron: z.string().optional().describe(cronDesc),
        run_at: z.string().optional().describe(runAtDesc),
        cwd: z.string().optional().describe('Absolute working folder for code tasks (defaults to the current session folder)'),
        kind: z.enum(['code', 'chat']).optional().describe('code (default) runs in a folder with tools; chat is a plain conversation'),
        permission_mode: z.enum(AGENT_MODES).optional().describe('Permission mode for the unattended run (default acceptEdits)')
      }, (args) => guarded(async () => {
        const schedule = toSchedule(args.cron, args.run_at)
        if (!schedule) throw new Error('Provide cron or run_at')
        const kind = args.kind ?? 'code'
        const cwd = kind === 'code' ? args.cwd ?? defaults?.cwd ?? null : null
        if (kind === 'code' && !cwd) throw new Error('cwd is required for code tasks')
        const t = await upsertTask({ name: args.name, prompt: args.prompt, schedule, enabled: true, kind, cwd, model: '', permissionMode: args.permission_mode ?? 'acceptEdits' })
        return summarize(t)
      })),

      tool('update_scheduled_task', 'Update fields of an existing scheduled task. Omitted fields are kept.', {
        id: z.string(),
        name: z.string().optional(),
        prompt: z.string().optional(),
        cron: z.string().optional().describe(cronDesc),
        run_at: z.string().optional().describe(runAtDesc),
        enabled: z.boolean().optional(),
        cwd: z.string().optional(),
        permission_mode: z.enum(AGENT_MODES).optional()
      }, (args) => guarded(async () => {
        const t = getTask(args.id)
        if (!t) throw new Error(`Task not found: ${args.id}`)
        const updated = await upsertTask({
          ...t,
          name: args.name ?? t.name,
          prompt: args.prompt ?? t.prompt,
          schedule: toSchedule(args.cron, args.run_at) ?? t.schedule,
          enabled: args.enabled ?? t.enabled,
          cwd: args.cwd ?? t.cwd,
          permissionMode: args.permission_mode ?? t.permissionMode
        })
        return summarize(updated)
      })),

      tool('delete_scheduled_task', 'Delete a scheduled task by id.', { id: z.string() }, (args) => guarded(() => {
        if (!getTask(args.id)) throw new Error(`Task not found: ${args.id}`)
        deleteTask(args.id)
        return `Deleted task ${args.id}`
      }), { annotations: { destructiveHint: true } }),

      tool('run_scheduled_task', 'Run a scheduled task immediately in a new session.', { id: z.string() }, (args) =>
        guarded(async () => ({ started: true, ...(await runTaskNow(args.id)) })))
    ]
  })
}
