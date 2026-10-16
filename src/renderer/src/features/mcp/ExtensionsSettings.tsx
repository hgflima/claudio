// Owner: agent "mcp-quick". Settings › Extensions (.mcpb/.dxt desktop extensions).
import { useEffect, useState } from 'react'
import { FolderOpen, PackagePlus, Settings2, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { ExtensionInfo, ExtensionPreview, McpServerStatus } from '@/lib/api'
import { ExtensionIcon, InstallExtensionDialog } from './InstallExtensionDialog'
import { Modal } from './Modal'
import { Button, StatusBadge, Toggle, errorMessage } from './ui'
import { UserConfigForm, missingRequired, type ConfigValues } from './UserConfigForm'
import { useMcp } from './useMcp'

function ConfigureDialog({ ext, onClose }: { ext: ExtensionInfo; onClose: () => void }) {
  const [values, setValues] = useState<ConfigValues>(ext.userConfig)
  const [error, setError] = useState<string | null>(null)
  const missing = missingRequired(ext.userConfigSchema, values)
  const save = () => api.invoke('ext:setConfig', ext.id, values).then(onClose, (e: unknown) => setError(errorMessage(e)))
  return (
    <Modal title={`Configure ${ext.displayName}`} onClose={onClose}>
      <div className="space-y-4">
        <UserConfigForm fields={ext.userConfigSchema} values={values} onChange={setValues} />
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={missing.length > 0} onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

function ExtensionRow({ ext, status, onConfigure, onError }: { ext: ExtensionInfo; status?: McpServerStatus; onConfigure: () => void; onError: (m: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const run = (p: Promise<unknown>) => { p.catch((e: unknown) => onError(errorMessage(e))) }
  const tools = status?.tools?.length ? status.tools : (ext.tools ?? []).map((t) => t.name)
  return (
    <li className="space-y-2 rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <div className="flex items-start gap-3">
        <ExtensionIcon src={ext.iconDataUrl} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-medium text-fg">{ext.displayName}</span>
            <span className="text-xs text-fg-subtle">v{ext.version}{ext.author ? ` · ${ext.author}` : ''}</span>
          </div>
          <div className="mt-0.5"><StatusBadge status={status?.status ?? (ext.enabled ? 'pending' : 'disabled')} /></div>
          {status?.error && <p className="mt-1 text-xs text-danger">{status.error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirm ? (
            <>
              <Button variant="danger" onClick={() => run(api.invoke('ext:remove', ext.id))}>Remove</Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <>
              {ext.userConfigSchema.length > 0 && <Button variant="ghost" onClick={onConfigure}><Settings2 className="size-3.5" />Configure</Button>}
              <Button variant="ghost" aria-label="Remove" onClick={() => setConfirm(true)}><Trash2 className="size-3.5" /></Button>
              <Toggle checked={ext.enabled} onChange={(v) => run(api.invoke('ext:setEnabled', ext.id, v))} label={`Enable ${ext.displayName}`} />
            </>
          )}
        </div>
      </div>
      {ext.description && <p className="pl-12 text-xs text-fg-muted">{ext.description}</p>}
      {tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pl-12">
          {tools.map((t) => <li key={t} className="rounded-md bg-code-bg px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{t}</li>)}
        </ul>
      )}
    </li>
  )
}

export function ExtensionsSettings() {
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null)
  const { statuses } = useMcp()
  const [preview, setPreview] = useState<ExtensionPreview | null>(null)
  const [configuring, setConfiguring] = useState<ExtensionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.invoke('ext:list').then(setExtensions)
    return api.on('ext:changed', setExtensions)
  }, [])

  const installFromFile = async () => {
    setError(null)
    try {
      const file = await api.invoke('ext:pickFile')
      if (file) setPreview(await api.invoke('ext:preview', file))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-base font-medium text-fg">Extensions</h2>
        <p className="text-sm text-fg-muted">Desktop extensions (.mcpb, .dxt) bundle an MCP server you can install in one click. Changes apply to new sessions.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void installFromFile()}><PackagePlus className="size-3.5" />Install extension…</Button>
        <Button onClick={() => void api.invoke('ext:openFolder')}><FolderOpen className="size-3.5" />Open extensions folder</Button>
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><X className="size-3.5" /></button>
        </div>
      )}
      {extensions === null ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : extensions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-fg">No extensions installed</p>
          <p className="mt-1 text-xs text-fg-muted">Install a .mcpb or .dxt file, or double-click one in Finder.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {extensions.map((x) => (
            <ExtensionRow key={x.id} ext={x} status={statuses[x.name]} onConfigure={() => setConfiguring(x)} onError={setError} />
          ))}
        </ul>
      )}
      {preview && <InstallExtensionDialog preview={preview} onClose={() => setPreview(null)} />}
      {configuring && <ConfigureDialog ext={configuring} onClose={() => setConfiguring(null)} />}
    </div>
  )
}
