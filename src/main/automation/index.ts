// Owner: agent "automation". Scheduled tasks engine + in-process MCP tools for the agent.
import { handle } from '../core/ipc'
import { describeCron } from './cron'
import { deleteTask, listTasks, runTaskNow, startScheduler, taskRuns, upsertTask } from './scheduler'

export { getAutomationMcpServer } from './mcp'

export function registerAutomation(): void {
  handle('tasks:list', () => listTasks())
  handle('tasks:upsert', (task) => upsertTask(task))
  handle('tasks:delete', (id) => { if (typeof id === 'string') deleteTask(id) })
  handle('tasks:runNow', (id) => runTaskNow(String(id)))
  handle('tasks:runs', (id) => taskRuns(String(id)))
  handle('tasks:describeCron', (expr) => describeCron(String(expr)))
  startScheduler()
}
