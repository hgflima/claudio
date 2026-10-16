import { FolderOpen, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { ExtUserConfigField } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button, Field, inputClass } from './ui'

export type ConfigValues = Record<string, unknown>

export function missingRequired(fields: ExtUserConfigField[], values: ConfigValues): string[] {
  const empty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
  return fields.filter((f) => f.required && empty(values[f.key]) && empty(f.default)).map((f) => f.title)
}

async function pick(type: 'directory' | 'file'): Promise<string[]> {
  if (type === 'directory') { const p = await api.invoke('app:pickFolder'); return p ? [p] : [] }
  return api.invoke('app:pickFiles')
}

function PathInput({ field, value, onChange }: { field: ExtUserConfigField; value: unknown; onChange: (v: unknown) => void }) {
  const type = field.type as 'directory' | 'file'
  if (field.multiple) {
    const list = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="space-y-1.5">
        {list.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={p}>{p}</span>
            <button type="button" aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))} className="text-fg-subtle hover:text-fg"><X className="size-3.5" /></button>
          </div>
        ))}
        <Button onClick={() => void pick(type).then((ps) => ps.length && onChange([...list, ...ps]))}><Plus className="size-3.5" />Add {type}</Button>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <input className={cn(inputClass, 'font-mono')} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.default !== undefined ? String(field.default) : '/absolute/path'} />
      <Button onClick={() => void pick(type).then((ps) => ps[0] && onChange(ps[0]))}><FolderOpen className="size-3.5" />Choose…</Button>
    </div>
  )
}

/** Form generated from a manifest `user_config` schema. Defaults are shown as placeholders and applied at runtime. */
export function UserConfigForm({ fields, values, onChange }: { fields: ExtUserConfigField[]; values: ConfigValues; onChange: (v: ConfigValues) => void }) {
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v })
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const v = values[f.key]
        const label = `${f.title}${f.required ? ' *' : ''}`
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 accent-accent" checked={v === undefined ? f.default === true : v === true} onChange={(e) => set(f.key, e.target.checked)} />
              <span>
                <span className="block text-xs font-medium text-fg">{label}</span>
                {f.description && <span className="block text-[11px] text-fg-subtle">{f.description}</span>}
              </span>
            </label>
          )
        }
        return (
          <Field key={f.key} label={label} hint={f.description}>
            {f.type === 'directory' || f.type === 'file' ? (
              <PathInput field={f} value={v} onChange={(x) => set(f.key, x)} />
            ) : f.multiple ? (
              <textarea
                className={inputClass}
                rows={3}
                value={Array.isArray(v) ? v.join('\n') : ''}
                onChange={(e) => set(f.key, e.target.value.split('\n').filter((l) => l.trim()))}
                placeholder="One per line"
              />
            ) : (
              <input
                className={inputClass}
                type={f.sensitive ? 'password' : f.type === 'number' ? 'number' : 'text'}
                min={f.min}
                max={f.max}
                autoComplete="off"
                value={v === undefined || v === null ? '' : String(v)}
                onChange={(e) => set(f.key, f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
                placeholder={f.default !== undefined ? String(f.default) : undefined}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}
