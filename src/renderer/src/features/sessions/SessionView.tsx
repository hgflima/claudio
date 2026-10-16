import { useEffect, useState } from 'react'
import { CircleAlert, RotateCw, X } from 'lucide-react'
import { useUi } from '@/stores/ui'
import type { PermissionRequest, SessionMeta, TranscriptItem } from '@shared/ipc'
import { errMsg, interrupt, loadTranscript, respondPermission, sendMessage, updateSession, useSessions } from './store'
import { useSessionsEffects } from './effects'
import { Home } from './home/Home'
import { TrustDialog } from './home/TrustDialog'
import { Transcript } from './transcript/Transcript'
import { Composer } from './composer/Composer'
import { CwdPill, ModePill, ModelPill } from './composer/Pills'
import { PermissionCard } from './permission/PermissionCard'
import { Button } from './ui/Dialog'

const NO_PERMS: PermissionRequest[] = []

export function SessionView() {
  useSessionsEffects()
  const activeId = useUi((s) => s.activeSessionId)
  const session = useSessions((s) => (activeId ? s.sessions[activeId] : undefined))
  const listReady = useSessions((s) => s.listStatus === 'ready')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session ? (
        <ActiveSession key={session.id} session={session} />
      ) : activeId && !listReady ? (
        <div className="flex-1" />
      ) : (
        <Home />
      )}
      <TrustDialog />
    </div>
  )
}

function ActiveSession({ session }: { session: SessionMeta }) {
  const perms = useSessions((s) => s.permissions[session.id] ?? NO_PERMS)
  const running = session.status === 'running' || session.status === 'awaiting-permission'
  const pending = perms[0]
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    void loadTranscript(session.id)
  }, [session.id])

  const stop = () => void interrupt(session.id).catch((e) => setSendError(errMsg(e)))

  const allowPending = (): boolean => {
    if (!pending || pending.toolName === 'AskUserQuestion' || pending.toolName === 'ExitPlanMode') return false
    void respondPermission({ sessionId: session.id, requestId: pending.requestId, decision: 'allow', scope: 'once' })
    return true
  }

  return (
    <>
      <SessionHeader session={session} />
      <Transcript session={session} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-5">
        {session.status === 'error' && session.lastError && <ErrorBanner session={session} />}
        {sendError && (
          <div className="flex items-center justify-between rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {sendError}
            <button type="button" aria-label="Dismiss" onClick={() => setSendError(null)}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {pending && <PermissionCard key={pending.requestId} request={pending} cwd={session.cwd} queued={perms.length} />}
        <Composer
          draftKey={session.id}
          sessionId={session.id}
          cwd={session.cwd}
          running={running}
          placeholder={running ? 'Queue a follow-up…' : 'Reply to Claude…'}
          onInterrupt={stop}
          onEmptyEnter={allowPending}
          onSubmit={async (text, attachments) => {
            setSendError(null)
            try {
              await sendMessage(session.id, text, attachments)
            } catch (e) {
              setSendError(errMsg(e))
              throw e
            }
          }}
          status={session.queued > 0 && <span className="px-1.5 text-xs text-fg-subtle">{session.queued} queued</span>}
          pills={
            <>
              <ModelPill value={session.model} onChange={(model) => void updateSession(session.id, { model }).catch(() => {})} />
              {session.kind === 'code' && (
                <ModePill
                  value={session.permissionMode}
                  onChange={(permissionMode) => void updateSession(session.id, { permissionMode }).catch(() => {})}
                />
              )}
              {session.cwd && <CwdPill cwd={session.cwd} />}
            </>
          }
        />
      </div>
    </>
  )
}

function SessionHeader({ session }: { session: SessionMeta }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-5">
      <div className="min-w-0 truncate text-[13px] font-medium">{session.title || 'Untitled'}</div>
      {session.archived && <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10.5px] text-fg-muted">Archived</span>}
    </div>
  )
}

function lastUserItem(sessionId: string): Extract<TranscriptItem, { type: 'user' }> | undefined {
  const t = useSessions.getState().transcripts[sessionId]
  if (!t) return undefined
  for (let i = t.ids.length - 1; i >= 0; i--) {
    const it = t.items[t.ids[i]]
    if (it?.type === 'user') return it
  }
  return undefined
}

function ErrorBanner({ session }: { session: SessionMeta }) {
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    const last = lastUserItem(session.id)
    if (!last) return
    setBusy(true)
    try {
      await sendMessage(session.id, last.text, last.attachments)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-[13px]">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg">{session.lastError}</div>
      <Button className="h-7 shrink-0" disabled={busy} onClick={() => void retry()}>
        <RotateCw className="size-3.5" /> Retry
      </Button>
    </div>
  )
}
