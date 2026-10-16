import { useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { cancelPendingStart, confirmPendingStart, errMsg, goHome, useSessions } from '../store'
import { clearDraft, setDraftText } from '../composer/drafts'
import { Button, Dialog } from '../ui/Dialog'
import { tildify } from '../util'

const BLOCKED: Record<string, string> = {
  home: 'Claudio can’t start a session in your home folder. Pick a project folder instead.',
  root: 'Claudio can’t start a session at the filesystem root.',
  network: 'Network volumes aren’t supported for sessions.',
  missing: 'This folder doesn’t exist anymore.'
}

export function TrustDialog() {
  const pending = useSessions((s) => s.pendingStart)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pending) return null

  const blocked = pending.check.blocked
  const cancel = () => {
    const p = cancelPendingStart()
    setError(null)
    if (p) {
      setDraftText('home', p.text)
      goHome(p.cwd)
    }
  }
  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await confirmPendingStart()
      clearDraft('home')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={cancel}
      title={blocked ? 'Can’t use this folder' : <>Trust <span className="font-mono text-[13px]">{tildify(pending.cwd)}</span> and start a session?</>}
      footer={
        blocked ? (
          <Button variant="primary" onClick={cancel}>OK</Button>
        ) : (
          <>
            <Button onClick={cancel}>Cancel</Button>
            <Button autoFocus variant="primary" disabled={busy} onClick={() => void confirm()}>
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Trust and start
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{pending.check.reason ?? BLOCKED[blocked]}</span>
        </div>
      ) : (
        <p>
          Claude will be able to read files in this folder and, with your permission, edit files and run commands.
          {pending.check.reason && <span className="mt-2 block">{pending.check.reason}</span>}
        </p>
      )}
      {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}
    </Dialog>
  )
}
