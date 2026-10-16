import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { SkillInfo } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Modal } from './Modal'
import { Button, Field, errorMessage, inputClass } from './ui'

export function NewSkillDialog({ cwd, onClose, onCreated }: { cwd?: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    setError(null)
    api.invoke('skills:create', { name, description, body, scope, cwd: scope === 'project' ? cwd : undefined })
      .then(() => { onCreated(); onClose() }, (e: unknown) => setError(errorMessage(e)))
  }

  return (
    <Modal title="New skill" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Name" hint="Lowercase with dashes, e.g. release-notes.">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="release-notes" />
          </Field>
          <Field label="Location">
            <div className="flex rounded-lg border border-border p-0.5">
              {(['user', 'project'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={s === 'project' && !cwd}
                  title={s === 'project' && !cwd ? 'Open a session in a folder to create project skills' : undefined}
                  onClick={() => setScope(s)}
                  className={cn('rounded-md px-2.5 py-1 text-xs disabled:opacity-40', scope === s ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:text-fg')}
                >
                  {s === 'user' ? 'Personal' : 'This project'}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Description" hint="When should Claude use this skill? Claude reads this to decide.">
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use when the user asks to write release notes from a list of commits." />
        </Field>
        <Field label="Instructions (Markdown)">
          <textarea className={cn(inputClass, 'font-mono text-xs')} rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'# Release notes\n\n1. Group commits by type…'} />
        </Field>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || !description.trim()} onClick={create}>Create skill</Button>
        </div>
      </div>
    </Modal>
  )
}

export function EditSkillDialog({ skill, onClose, onSaved }: { skill: SkillInfo; onClose: () => void; onSaved: () => void }) {
  const readOnly = skill.source === 'plugin'
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.invoke('skills:read', skill.path).then(setContent, (e: unknown) => setError(errorMessage(e)))
  }, [skill.path])

  const save = () => {
    if (content === null) return
    setSaving(true)
    api.invoke('skills:save', skill.path, content)
      .then(() => { onSaved(); onClose() }, (e: unknown) => setError(errorMessage(e)))
      .finally(() => setSaving(false))
  }

  return (
    <Modal title={readOnly ? skill.name : `Edit ${skill.name}`} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="truncate font-mono text-[11px] text-fg-subtle" title={skill.path}>{skill.path}</p>
        {content === null && !error ? <p className="text-sm text-fg-subtle">Loading…</p> : (
          <textarea
            className={cn(inputClass, 'h-[50vh] resize-none font-mono text-xs leading-relaxed')}
            value={content ?? ''}
            readOnly={readOnly}
            spellCheck={false}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's' && !readOnly) { e.preventDefault(); save() } }}
          />
        )}
        {readOnly && <p className="text-[11px] text-fg-subtle">Skills provided by plugins are read-only.</p>}
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button variant="primary" disabled={saving || content === null} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>}
        </div>
      </div>
    </Modal>
  )
}
