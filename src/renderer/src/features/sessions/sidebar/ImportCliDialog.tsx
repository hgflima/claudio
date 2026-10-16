import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { api } from '@/lib/api'
import type { CliSessionInfo } from '@shared/ipc'
import { errMsg, upsertMeta } from '../store'
import { Button, Dialog } from '../ui/Dialog'
import { basename, relativeTime, tildify } from '../util'

export function ImportCliDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<CliSessionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setList(null)
    setError(null)
    setSelected(new Set())
    api
      .invoke('sessions:listCliSessions')
      .then((l) => setList([...l].sort((a, b) => b.lastActivityAt - a.lastActivityAt)))
      .catch((e) => setError(errMsg(e)))
  }, [open])

  const importable = useMemo(() => (list ?? []).filter((s) => !s.alreadyImported), [list])
  const allSelected = importable.length > 0 && importable.every((s) => selected.has(s.cliSessionId))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const doImport = async () => {
    setBusy(true)
    try {
      const metas = await api.invoke('sessions:importCli', [...selected])
      metas.forEach(upsertMeta)
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-xl"
      title="Import from Claude Code CLI"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!selected.size || busy} onClick={doImport}>
            {busy && <LoaderCircle className="size-3.5 animate-spin" />}
            Import{selected.size ? ` ${selected.size}` : ''}
          </Button>
        </>
      }
    >
      <p className="mb-3">Sessions you started with <code className="font-mono text-xs">claude</code> in the terminal.</p>
      {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}
      {!list && !error && (
        <div className="flex items-center gap-2 py-6 text-fg-subtle">
          <LoaderCircle className="size-4 animate-spin" /> Looking for sessions…
        </div>
      )}
      {list && list.length === 0 && <div className="py-6 text-center text-fg-subtle">No CLI sessions found.</div>}
      {list && list.length > 0 && (
        <div className="-mx-2">
          {importable.length > 1 && (
            <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:bg-bg-hover">
              <input
                type="checkbox"
                className="accent-accent"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(importable.map((s) => s.cliSessionId)))}
              />
              Select all
            </label>
          )}
          <div className="max-h-[50vh] overflow-auto">
            {list.map((s) => (
              <label
                key={s.cliSessionId}
                className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-bg-hover has-disabled:opacity-50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-accent"
                  disabled={s.alreadyImported}
                  checked={s.alreadyImported || selected.has(s.cliSessionId)}
                  onChange={() => toggle(s.cliSessionId)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-fg">{s.title || 'Untitled'}</div>
                  <div className="truncate text-xs text-fg-subtle" title={s.cwd}>
                    {basename(s.cwd)} · {tildify(s.cwd)} · {s.messageCount} messages · {relativeTime(s.lastActivityAt)}
                    {s.alreadyImported && ' · imported'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}
