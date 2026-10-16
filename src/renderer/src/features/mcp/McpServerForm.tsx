import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import type { McpServerConfig, McpServerEntry } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatPairs, parseLines, parsePairs } from './lines'
import { Button, Field, errorMessage, inputClass } from './ui'

type Kind = 'stdio' | 'http' | 'sse'

interface Props {
  initial?: McpServerEntry
  onDone: () => void
}

export function McpServerForm({ initial, onDone }: Props) {
  const c = initial?.config
  const remote = c && 'url' in c ? c : undefined
  const local = c && 'command' in c ? c : undefined
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<Kind>(remote?.type ?? 'stdio')
  const [command, setCommand] = useState(local?.command ?? '')
  const [args, setArgs] = useState((local?.args ?? []).join('\n'))
  const [env, setEnv] = useState(formatPairs(local?.env, '='))
  const [url, setUrl] = useState(remote?.url ?? '')
  const [headers, setHeaders] = useState(formatPairs(remote?.headers, ':'))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const build = (): McpServerConfig | string => {
    if (kind === 'stdio') {
      if (!command.trim()) return 'Command is required'
      const e = parsePairs(env, '=')
      if (e.error) return `Environment — ${e.error}`
      return { type: 'stdio', command: command.trim(), args: parseLines(args), env: e.value }
    }
    if (!/^https?:\/\//.test(url.trim())) return 'URL must start with http:// or https://'
    const h = parsePairs(headers, ':')
    if (h.error) return `Headers — ${h.error}`
    return { type: kind, url: url.trim(), headers: h.value }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const config = build()
    if (typeof config === 'string') return setError(config)
    setSaving(true)
    setError(null)
    try {
      await api.invoke('mcp:upsert', { name: name.trim(), config, enabled: initial?.enabled ?? true }, initial?.name)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-bg-elevated p-4">
      <h3 className="text-sm font-medium">{initial ? `Edit ${initial.name}` : 'Add MCP server'}</h3>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" autoFocus required />
        </Field>
        <Field label="Type">
          <div className="flex rounded-lg border border-border p-0.5">
            {(['stdio', 'http', 'sse'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn('rounded-md px-2.5 py-1 text-xs', kind === k ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {k === 'stdio' ? 'Local (stdio)' : k.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {kind === 'stdio' ? (
        <>
          <Field label="Command" hint="Resolved using your login shell PATH.">
            <input className={cn(inputClass, 'font-mono')} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
          </Field>
          <Field label="Arguments" hint="One per line.">
            <textarea className={cn(inputClass, 'font-mono')} rows={3} value={args} onChange={(e) => setArgs(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/Users/me/Documents'} />
          </Field>
          <Field label="Environment variables" hint="KEY=VALUE, one per line.">
            <textarea className={cn(inputClass, 'font-mono')} rows={2} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="API_TOKEN=…" />
          </Field>
        </>
      ) : (
        <>
          <Field label="URL">
            <input className={cn(inputClass, 'font-mono')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
          </Field>
          <Field label="Headers" hint="Name: value, one per line.">
            <textarea className={cn(inputClass, 'font-mono')} rows={2} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Authorization: Bearer …" />
          </Field>
        </>
      )}
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
