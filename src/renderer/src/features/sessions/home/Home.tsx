import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { PermissionMode, Settings } from '@shared/ipc'
import { errMsg, startSession, useSessions } from '../store'
import { Composer } from '../composer/Composer'
import { FolderPill, ModePill, ModelPill } from '../composer/Pills'

let cwdInitialized = false

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  const draft = useSessions((s) => s.draft)
  const setDraft = useSessions((s) => s.setDraft)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .invoke('settings:get')
      .then((s) => {
        if (!alive) return
        setSettings(s)
        if (!cwdInitialized) {
          cwdInitialized = true
          if (useSessions.getState().draft.cwd === null && s.recentFolders[0]) setDraft({ cwd: s.recentFolders[0] })
        }
      })
      .catch(() => {})
    const off = api.on('settings:changed', (s) => setSettings(s))
    return () => {
      alive = false
      off()
    }
  }, [setDraft])

  const mode: PermissionMode = draft.permissionMode ?? settings?.defaultPermissionMode ?? 'default'
  const model = draft.model || settings?.defaultModel || ''

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[12vh]">
      <div className="flex w-full max-w-2xl flex-col gap-7">
        <h1 className="text-center font-serif text-[34px] leading-tight font-normal tracking-tight text-fg">
          <span className="mr-2 text-accent">✻</span>
          {greeting()}
        </h1>
        <Composer
          draftKey="home"
          large
          cwd={draft.cwd}
          placeholder={draft.cwd ? 'Describe a coding task…' : 'How can I help you today?'}
          onSubmit={async (text, attachments) => {
            setError(null)
            try {
              return await startSession({ cwd: draft.cwd, text, attachments })
            } catch (e) {
              setError(errMsg(e))
              throw e
            }
          }}
          pills={
            <>
              <FolderPill value={draft.cwd} onChange={(cwd) => setDraft({ cwd })} />
              <ModelPill value={model} onChange={(v) => setDraft({ model: v })} />
              {draft.cwd && <ModePill value={mode} onChange={(v) => setDraft({ permissionMode: v })} />}
            </>
          }
        />
        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </div>
  )
}
