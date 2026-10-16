import { useEffect } from 'react'
import { api } from '@/lib/api'
import { commands } from '@/stores/commands'
import { useUi } from '@/stores/ui'
import {
  closeActiveSession, cycleSession, errMsg, goHome, initSessions, interrupt, newChat,
  reopenClosedSession, startSession, useSessions
} from './store'

/** Wires menu commands and Quick Entry to the sessions feature. Mount once (SessionView). */
export function useSessionsEffects(): void {
  useEffect(() => {
    initSessions()
    const offCmd = commands.subscribe((cmd) => {
      switch (cmd) {
        case 'new-session':
          goHome()
          break
        case 'new-chat':
          newChat().catch((e) => console.error(errMsg(e)))
          break
        case 'open-folder':
          void api.invoke('app:pickFolder').then((p) => p && goHome(p))
          break
        case 'close-session':
          closeActiveSession()
          break
        case 'reopen-closed-session':
          reopenClosedSession()
          break
        case 'next-session':
          cycleSession(1)
          break
        case 'prev-session':
          cycleSession(-1)
          break
        case 'focus-composer':
          useSessions.getState().focusComposer()
          break
        case 'interrupt': {
          const id = useUi.getState().activeSessionId
          const s = id ? useSessions.getState().sessions[id] : null
          if (s && (s.status === 'running' || s.status === 'awaiting-permission')) void interrupt(s.id)
          break
        }
      }
    })
    const offQuick = api.on('quick:submitted', ({ text, attachments, cwd }) => {
      startSession({ cwd, text, attachments }).catch((e) => console.error(errMsg(e)))
    })
    return () => {
      offCmd()
      offQuick()
    }
  }, [])
}
