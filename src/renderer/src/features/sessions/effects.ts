import { useEffect } from 'react'
import { api } from '@/lib/api'
import { commands } from '@/stores/commands'
import { useUi } from '@/stores/ui'
import {
  closeActiveSession, cycleSession, errMsg, forkSession, goHome, initSessions, interrupt, newChat,
  openInEditor, openSession, reopenClosedSession, seedHome, startSession, useSessions, workPath
} from './store'
import { setDraftText } from './composer/drafts'

function activeSession() {
  const id = useUi.getState().activeSessionId
  return id ? useSessions.getState().sessions[id] : undefined
}

/** Wires menu commands, Quick Entry and deep links to the sessions feature. Mount once (CommandPalette, always mounted). */
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
          const s = activeSession()
          if (s && (s.status === 'running' || s.status === 'awaiting-permission')) void interrupt(s.id)
          break
        }
        case 'command-palette':
          useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen)
          break
        case 'find':
          if (useUi.getState().view === 'sessions' && activeSession()) useSessions.getState().setFindOpen(true)
          break
        case 'fork-session': {
          const s = activeSession()
          if (s) forkSession(s.id).catch((e) => console.error(errMsg(e)))
          break
        }
        case 'open-in-editor': {
          const s = activeSession()
          const path = s ? workPath(s) : useSessions.getState().draft.cwd
          if (path) openInEditor(path).catch((e) => console.error(errMsg(e)))
          break
        }
        case 'open-scheduled-tasks':
          useUi.getState().setView('tasks')
          break
      }
    })
    const offQuick = api.on('quick:submitted', ({ text, attachments, cwd }) => {
      startSession({ cwd, text, attachments }).catch((e) => console.error(errMsg(e)))
    })
    const offLink = api.on('app:deepLink', (link) => {
      if (link.action === 'open-session') {
        openSession(link.sessionId)
        return
      }
      if (link.q) setDraftText('home', link.q)
      const cwd = link.kind === 'chat' ? null : link.folder
      seedHome({ cwd: cwd === undefined ? undefined : cwd })
    })
    return () => {
      offCmd()
      offQuick()
      offLink()
    }
  }, [])
}
