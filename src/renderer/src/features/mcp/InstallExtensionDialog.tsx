import { useState } from 'react'
import { AlertTriangle, Puzzle } from 'lucide-react'
import { api } from '@/lib/api'
import type { ExtensionPreview } from '@/lib/api'
import { Modal } from './Modal'
import { Button, errorMessage } from './ui'
import { UserConfigForm, missingRequired, type ConfigValues } from './UserConfigForm'

export function ExtensionIcon({ src, className = 'size-10' }: { src?: string; className?: string }) {
  return src
    ? <img src={src} alt="" className={`${className} shrink-0 rounded-lg object-contain`} />
    : <div className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-bg-hover text-fg-muted`}><Puzzle className="size-1/2" /></div>
}

export function InstallExtensionDialog({ preview, onClose }: { preview: ExtensionPreview; onClose: () => void }) {
  const m = preview.manifest
  const [values, setValues] = useState<ConfigValues>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const missing = missingRequired(m.userConfigSchema, values)
  const upgrade = preview.alreadyInstalledVersion

  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.invoke('ext:install', { filePath: preview.filePath, userConfig: values })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={upgrade ? 'Update extension' : 'Install extension'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ExtensionIcon src={m.iconDataUrl} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{m.displayName} <span className="font-normal text-fg-subtle">v{m.version}</span></p>
            {m.author && <p className="text-xs text-fg-muted">by {m.author}</p>}
            {m.description && <p className="mt-1 text-xs text-fg-muted">{m.description}</p>}
          </div>
        </div>
        {upgrade && <p className="rounded-lg bg-bg-hover px-3 py-2 text-xs text-fg-muted">Version {upgrade} is installed. It will be replaced; your settings are kept.</p>}
        {!m.compatibility.ok && (
          <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"><AlertTriangle className="mt-px size-3.5 shrink-0" />{m.compatibility.reason}</p>
        )}
        {m.tools && m.tools.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg">Tools</p>
            <ul className="flex flex-wrap gap-1.5">{m.tools.map((t) => <li key={t.name} title={t.description} className="rounded-md bg-code-bg px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{t.name}</li>)}</ul>
          </div>
        )}
        {m.userConfigSchema.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-fg">Configuration</p>
            <UserConfigForm fields={m.userConfigSchema} values={values} onChange={setValues} />
          </div>
        )}
        <p className="text-[11px] text-fg-subtle">Extensions run code on your Mac with your permissions. Only install extensions you trust.</p>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !m.compatibility.ok || missing.length > 0} title={missing.length ? `Required: ${missing.join(', ')}` : undefined} onClick={() => void install()}>
            {busy ? 'Installing…' : upgrade ? 'Update' : 'Install'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
