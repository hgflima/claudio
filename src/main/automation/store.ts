import type { ScheduledTask, TaskRun } from '@shared/ipc'
import { dataPath, readJson, writeJson } from '../core/store'

const TASKS_FILE = () => dataPath('scheduled-tasks.json')
const RUNS_FILE = () => dataPath('task-runs.json')
const MAX_RUNS = 50

export function loadTasks(): ScheduledTask[] {
  const v = readJson<unknown>(TASKS_FILE(), [])
  return Array.isArray(v) ? (v as ScheduledTask[]) : []
}

export function saveTasks(tasks: ScheduledTask[]): void {
  writeJson(TASKS_FILE(), tasks)
}

export function loadRuns(): Record<string, TaskRun[]> {
  const v = readJson<unknown>(RUNS_FILE(), {})
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, TaskRun[]>) : {}
}

export function saveRuns(runs: Record<string, TaskRun[]>): void {
  for (const id of Object.keys(runs)) if (runs[id].length > MAX_RUNS) runs[id] = runs[id].slice(-MAX_RUNS)
  writeJson(RUNS_FILE(), runs)
}
