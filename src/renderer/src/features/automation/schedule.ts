import type { TaskSchedule } from '@shared/ipc'

export type Preset = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'once' | 'custom'

export interface ScheduleDraft {
  preset: Preset
  time: string // HH:MM
  minute: number // for hourly
  day: number // 0 = Sunday
  onceAt: string // datetime-local value
  cron: string
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'once', label: 'Once' },
  { id: 'custom', label: 'Custom cron' }
]

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number): string => String(n).padStart(2, '0')

export function toLocalInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseTime(time: string): { h: number; m: number } {
  const [h, m] = time.split(':').map(Number)
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

const fmtTime = (h: number, m: number): string => `${h}:${pad(m)}`

export function defaultDraft(): ScheduleDraft {
  return { preset: 'weekdays', time: '09:00', minute: 0, day: 1, onceAt: toLocalInput(Date.now() + 60 * 60_000), cron: '0 9 * * 1-5' }
}

export function draftToSchedule(d: ScheduleDraft): TaskSchedule {
  const { h, m } = parseTime(d.time)
  switch (d.preset) {
    case 'hourly': return { type: 'cron', expr: `${d.minute} * * * *` }
    case 'daily': return { type: 'cron', expr: `${m} ${h} * * *` }
    case 'weekdays': return { type: 'cron', expr: `${m} ${h} * * 1-5` }
    case 'weekly': return { type: 'cron', expr: `${m} ${h} * * ${d.day}` }
    case 'once': return { type: 'once', at: new Date(d.onceAt).getTime() }
    case 'custom': return { type: 'cron', expr: d.cron.trim() }
  }
}

const NUM = /^\d+$/

/** Recognizes the cron shapes produced by the presets. */
export function scheduleToDraft(s: TaskSchedule): ScheduleDraft {
  const base = defaultDraft()
  if (s.type === 'once') return { ...base, preset: 'once', onceAt: toLocalInput(s.at) }
  const f = s.expr.trim().split(/\s+/)
  const custom = { ...base, preset: 'custom' as const, cron: s.expr }
  if (f.length !== 5 || !NUM.test(f[0]) || f[2] !== '*' || f[3] !== '*') return custom
  if (f[1] === '*' && f[4] === '*') return { ...base, preset: 'hourly', minute: Number(f[0]), cron: s.expr }
  if (!NUM.test(f[1])) return custom
  const time = `${pad(Number(f[1]))}:${pad(Number(f[0]))}`
  if (f[4] === '*') return { ...base, preset: 'daily', time, cron: s.expr }
  if (f[4] === '1-5') return { ...base, preset: 'weekdays', time, cron: s.expr }
  if (/^[0-7]$/.test(f[4])) return { ...base, preset: 'weekly', time, day: Number(f[4]) % 7, cron: s.expr }
  return custom
}

export function describeSchedule(s: TaskSchedule): string {
  if (s.type === 'once') return `Once on ${new Date(s.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
  const f = s.expr.trim().split(/\s+/)
  if (f.length === 5 && f[2] === '*' && f[3] === '*') {
    const every = /^\*\/(\d+)$/.exec(f[0])
    if (every && f[1] === '*' && f[4] === '*') return `Every ${every[1]} minutes`
    if (NUM.test(f[0]) && f[1] === '*' && f[4] === '*') return f[0] === '0' ? 'Every hour' : `Every hour at :${pad(Number(f[0]))}`
    if (NUM.test(f[0]) && NUM.test(f[1])) {
      const t = fmtTime(Number(f[1]), Number(f[0]))
      if (f[4] === '*') return `Every day at ${t}`
      if (f[4] === '1-5') return `Every weekday at ${t}`
      if (f[4] === '0,6' || f[4] === '6,0') return `Every weekend at ${t}`
      if (/^[0-7]$/.test(f[4])) return `Every ${DAYS[Number(f[4]) % 7]} at ${t}`
    }
  }
  return s.expr
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = ts - now
  const abs = Math.abs(diff)
  if (abs < 60_000) return diff >= 0 ? 'in less than a minute' : 'just now'
  if (abs < 60 * 60_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 24 * 60 * 60_000) return rtf.format(Math.round(diff / (60 * 60_000)), 'hour')
  return rtf.format(Math.round(diff / (24 * 60 * 60_000)), 'day')
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
