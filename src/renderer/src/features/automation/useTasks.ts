import { useEffect, useState } from 'react'
import type { ScheduledTask } from '@shared/ipc'
import { api } from '@/lib/api'

export function useTasks(): { tasks: ScheduledTask[] | null; error: string | null } {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    api.invoke('tasks:list').then((t) => { if (alive) setTasks(t) }, (e) => { if (alive) setError(String(e?.message ?? e)) })
    const off = api.on('tasks:changed', (t) => setTasks(t))
    return () => { alive = false; off() }
  }, [])
  return { tasks, error }
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
