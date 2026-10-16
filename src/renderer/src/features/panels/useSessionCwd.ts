import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/** cwd of a session (null for chat sessions / unknown). `loading` until first fetch resolves. */
export function useSessionCwd(sessionId: string | null): { cwd: string | null; loading: boolean } {
  const [state, setState] = useState<{ id: string | null; cwd: string | null; loading: boolean }>({ id: null, cwd: null, loading: false })

  useEffect(() => {
    if (!sessionId) { setState({ id: null, cwd: null, loading: false }); return }
    let alive = true
    setState({ id: sessionId, cwd: null, loading: true })
    api.invoke('sessions:get', sessionId)
      .then((s) => { if (alive) setState({ id: sessionId, cwd: s?.cwd ?? null, loading: false }) })
      .catch(() => { if (alive) setState({ id: sessionId, cwd: null, loading: false }) })
    const off = api.on('sessions:changed', (s) => {
      if (s.id === sessionId) setState((prev) => (prev.cwd === s.cwd && !prev.loading ? prev : { id: sessionId, cwd: s.cwd, loading: false }))
    })
    return () => { alive = false; off() }
  }, [sessionId])

  return state.id === sessionId ? { cwd: state.cwd, loading: state.loading } : { cwd: null, loading: !!sessionId }
}
