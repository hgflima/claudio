import { CronExpressionParser } from 'cron-parser'
import type { TaskSchedule } from '@shared/ipc'

const tz = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Validates a standard 5-field cron expression (minute precision). Throws with a readable message. */
export function parseCron(expr: string, from: number = Date.now()) {
  const trimmed = expr.trim()
  if (trimmed.split(/\s+/).length !== 5) throw new Error('Use 5 fields: minute hour day-of-month month day-of-week')
  return CronExpressionParser.parse(trimmed, { currentDate: new Date(from), tz: tz() })
}

export function nextCronTimes(expr: string, count: number, from: number = Date.now()): number[] {
  return parseCron(expr, from).take(count).map((d) => d.getTime())
}

/** Next fire time strictly after `from`, or null when there is none. */
export function nextFire(schedule: TaskSchedule, from: number): number | null {
  if (schedule.type === 'once') return schedule.at
  try {
    const it = parseCron(schedule.expr, from)
    return it.hasNext() ? it.next().getTime() : null
  } catch {
    return null
  }
}

export function describeCron(expr: string): { valid: boolean; next?: number[]; error?: string } {
  try {
    return { valid: true, next: nextCronTimes(expr, 3) }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) }
  }
}
