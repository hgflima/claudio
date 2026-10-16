import { useState } from 'react'
import { FileArchive } from 'lucide-react'
import { api } from '@/lib/api'
import type { SkillInfo } from '@/lib/api'
import { Modal } from './Modal'
import { Button, errorMessage } from './ui'

const basename = (p: string) => p.split('/').pop() ?? p

export function InstallSkillDialog({ filePath, onClose, onInstalled }: { filePath: string; onClose: () => void; onInstalled?: (s: SkillInfo) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<SkillInfo | null>(null)

  const install = async () => {
    setBusy(true)
    setError(null)
    try { const s = await api.invoke('skills:installArchive', filePath); setInstalled(s); onInstalled?.(s) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title={installed ? 'Skill installed' : 'Install skill'} onClose={onClose}>
      <div className="space-y-4">
        {installed ? (
          <div className="space-y-1">
            <p className="font-mono text-sm text-fg">{installed.name}</p>
            {installed.description && <p className="text-xs text-fg-muted">{installed.description}</p>}
            <p className="pt-2 text-[11px] text-fg-subtle">Installed to {installed.path.replace(/\/SKILL\.md$/, '')}. It's available in new sessions.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-bg-hover text-fg-muted"><FileArchive className="size-5" /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{basename(filePath)}</p>
                <p className="text-xs text-fg-muted">Will be installed to ~/.claude/skills and available in every project.</p>
              </div>
            </div>
            <p className="text-[11px] text-fg-subtle">Skills are instructions Claude follows. Only install skills you trust.</p>
          </>
        )}
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {installed ? <Button variant="primary" onClick={onClose}>Done</Button> : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={busy} onClick={() => void install()}>{busy ? 'Installing…' : 'Install'}</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
