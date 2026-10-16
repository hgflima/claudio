import type { SessionMeta } from '@shared/ipc'

export function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export function relativeTo(path: string, cwd: string | null | undefined): string {
  if (!cwd) return path
  const base = cwd.replace(/[\\/]+$/, '')
  if (path === base) return '.'
  if (path.startsWith(base + '/')) return path.slice(base.length + 1)
  return path
}

export function tildify(p: string, home?: string): string {
  const h = home ?? guessHome(p)
  return h && p.startsWith(h) ? '~' + p.slice(h.length) : p
}

function guessHome(p: string): string | null {
  const m = p.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/)
  return m ? m[1] : null
}

export type DateGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older'
export const DATE_GROUPS: DateGroup[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older']

export function dateGroup(ts: number, now = Date.now()): DateGroup {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const today = start.getTime()
  const day = 86_400_000
  if (ts >= today) return 'Today'
  if (ts >= today - day) return 'Yesterday'
  if (ts >= today - 7 * day) return 'Previous 7 days'
  return 'Older'
}

export function groupSessions(list: SessionMeta[]): { group: DateGroup; sessions: SessionMeta[] }[] {
  const map = new Map<DateGroup, SessionMeta[]>()
  for (const s of list) {
    const g = dateGroup(s.lastActivityAt)
    const arr = map.get(g)
    if (arr) arr.push(s)
    else map.set(g, [s])
  }
  return DATE_GROUPS.filter((g) => map.has(g)).map((g) => ({ group: g, sessions: map.get(g)! }))
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
