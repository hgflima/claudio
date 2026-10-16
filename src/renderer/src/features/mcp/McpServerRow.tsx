import { useState } from 'react'
import { ChevronRight, Globe, Pencil, RefreshCw, Terminal, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { McpServerEntry, McpServerStatus } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button, StatusBadge, Toggle, errorMessage } from './ui'

interface Props {
  entry: McpServerEntry
  status?: McpServerStatus
  onEdit: () => void
  onError: (msg: string) => void
}

function summary(entry: McpServerEntry): string {
  const c = entry.config
  return 'url' in c ? c.url : [c.command, ...(c.args ?? [])].join(' ')
}

export function McpServerRow({ entry, status, onEdit, onError }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const state = status?.status ?? (entry.enabled ? 'pending' : 'disabled')
  const tools = status?.tools ?? []
  const hasDetails = Boolean(status?.error) || tools.length > 0

  const run = (p: Promise<unknown>) => { p.catch((e: unknown) => onError(errorMessage(e))) }
  const toggle = (enabled: boolean) => run(api.invoke('mcp:upsert', { ...entry, enabled }, entry.name))

  return (
    <li className="rounded-xl border border-border bg-bg-elevated">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          disabled={!hasDetails}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="text-fg-subtle hover:text-fg disabled:opacity-0"
        >
          <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
        </button>
        {'url' in entry.config ? <Globe className="size-4 shrink-0 text-fg-muted" /> : <Terminal className="size-4 shrink-0 text-fg-muted" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{entry.name}</span>
            <StatusBadge status={state} />
            {state === 'connected' && <span className="text-xs text-fg-subtle">· {tools.length} {tools.length === 1 ? 'tool' : 'tools'}</span>}
          </div>
          <p className="truncate font-mono text-[11px] text-fg-subtle" title={summary(entry)}>{summary(entry)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirmRemove ? (
            <>
              <Button variant="danger" onClick={() => run(api.invoke('mcp:remove', entry.name))}>Remove</Button>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" title="Test connection" disabled={!entry.enabled || state === 'pending'} onClick={() => run(api.invoke('mcp:test', entry.name))}>
                <RefreshCw className={cn('size-3.5', state === 'pending' && 'animate-spin')} />Test
              </Button>
              <Button variant="ghost" aria-label="Edit" onClick={onEdit}><Pencil className="size-3.5" /></Button>
              <Button variant="ghost" aria-label="Remove" onClick={() => setConfirmRemove(true)}><Trash2 className="size-3.5" /></Button>
              <Toggle checked={entry.enabled} onChange={toggle} label={`Enable ${entry.name}`} />
            </>
          )}
        </div>
      </div>
      {expanded && hasDetails && (
        <div className="space-y-2 border-t border-border px-4 py-3 pl-11">
          {status?.error && <pre className="overflow-x-auto rounded-lg bg-code-bg p-2.5 font-mono text-[11px] whitespace-pre-wrap text-danger">{status.error}</pre>}
          {tools.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tools.map((t) => <li key={t} className="rounded-md bg-code-bg px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{t}</li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
