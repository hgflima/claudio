// Owner: agent "mcp-quick". Settings › MCP servers.
import { useState } from 'react'
import { Download, FileJson, FolderOpen, Plus, RotateCw, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { McpServerEntry } from '@/lib/api'
import { McpServerForm } from './McpServerForm'
import { McpServerRow } from './McpServerRow'
import { Button, errorMessage } from './ui'
import { useMcp } from './useMcp'

type Editing = { mode: 'add' } | { mode: 'edit'; entry: McpServerEntry } | null

export function McpSettings() {
  const { servers, configPath, statuses } = useMcp()
  const [editing, setEditing] = useState<Editing>(null)
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  const run = (p: Promise<unknown>) => { p.catch((e: unknown) => setNotice({ kind: 'error', text: errorMessage(e) })) }

  const importFromDesktop = async () => {
    try {
      const { imported, skipped } = await api.invoke('mcp:importClaudeDesktop')
      const parts = [imported.length ? `Imported ${imported.join(', ')}.` : 'No new servers to import.']
      if (skipped.length) parts.push(`Skipped ${skipped.join(', ')} (already present or invalid).`)
      setNotice({ kind: 'info', text: parts.join(' ') })
    } catch (e) {
      setNotice({ kind: 'error', text: errorMessage(e) })
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-base font-medium text-fg">MCP servers</h2>
        <p className="text-sm text-fg-muted">
          Connect tools and data sources through the Model Context Protocol. Changes apply to new sessions.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEditing({ mode: 'add' })}><Plus className="size-3.5" />Add server</Button>
        <Button onClick={() => run(api.invoke('mcp:reload'))}><RotateCw className="size-3.5" />Reload</Button>
        <Button onClick={() => run(api.invoke('mcp:openConfig'))} title={configPath}><FileJson className="size-3.5" />Open config file</Button>
        <Button onClick={() => run(api.invoke('mcp:openLogs'))}><FolderOpen className="size-3.5" />Open logs</Button>
        <Button onClick={() => void importFromDesktop()}><Download className="size-3.5" />Import from Claude Desktop</Button>
      </div>

      {notice && (
        <div className={notice.kind === 'error' ? 'flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger' : 'flex items-start gap-2 rounded-lg bg-bg-hover px-3 py-2 text-xs text-fg-muted'}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X className="size-3.5" /></button>
        </div>
      )}

      {editing && (
        <McpServerForm
          key={editing.mode === 'edit' ? editing.entry.name : '__new'}
          initial={editing.mode === 'edit' ? editing.entry : undefined}
          onDone={() => setEditing(null)}
        />
      )}

      {servers.length === 0 && !editing ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-fg">No MCP servers yet</p>
          <p className="mt-1 text-xs text-fg-muted">Add one manually, edit the config file, or import the servers you already use in Claude Desktop.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {servers.map((s) => (
            <McpServerRow
              key={s.name}
              entry={s}
              status={statuses[s.name]}
              onEdit={() => setEditing({ mode: 'edit', entry: s })}
              onError={(text) => setNotice({ kind: 'error', text })}
            />
          ))}
        </ul>
      )}

      {configPath && <p className="truncate font-mono text-[11px] text-fg-subtle" title={configPath}>{configPath}</p>}
    </div>
  )
}
