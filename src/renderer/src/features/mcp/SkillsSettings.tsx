// Owner: agent "mcp-quick". Settings › Skills: list, create, edit, delete, install from archive.
import { useCallback, useEffect, useState } from 'react'
import { Eye, FileArchive, FolderGit2, FolderOpen, Pencil, Plus, Puzzle, RotateCw, Trash2, User, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { SkillInfo } from '@/lib/api'
import { InstallSkillDialog } from './InstallSkillDialog'
import { EditSkillDialog, NewSkillDialog } from './SkillEditor'
import { Button, errorMessage } from './ui'

const GROUPS: { source: SkillInfo['source']; title: string; icon: typeof User }[] = [
  { source: 'user', title: 'Personal', icon: User },
  { source: 'project', title: 'Project', icon: FolderGit2 },
  { source: 'plugin', title: 'Plugins', icon: Puzzle }
]

type Dialog = { kind: 'new' } | { kind: 'edit'; skill: SkillInfo } | { kind: 'install'; filePath: string } | null

function SkillRow({ skill, onOpen, onDeleted, onError }: { skill: SkillInfo; onOpen: () => void; onDeleted: () => void; onError: (m: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const editable = skill.source !== 'plugin'
  const remove = () => api.invoke('skills:delete', skill.path).then(onDeleted, (e: unknown) => onError(errorMessage(e)))
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate font-mono text-sm text-fg">{skill.name}</p>
        {skill.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted" title={skill.description}>{skill.description}</p>}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {confirm ? (
          <>
            <Button variant="danger" onClick={() => void remove()}>Delete</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" aria-label={editable ? 'Edit' : 'View'} onClick={onOpen}>{editable ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}</Button>
            <Button variant="ghost" aria-label="Reveal in Finder" title={skill.path} onClick={() => void api.invoke('app:showItemInFolder', skill.path)}><FolderOpen className="size-3.5" /></Button>
            {editable && <Button variant="ghost" aria-label="Delete" onClick={() => setConfirm(true)}><Trash2 className="size-3.5" /></Button>}
          </>
        )}
      </div>
    </li>
  )
}

/** `cwd` adds the project's `.claude/skills` to the listing and enables project-scoped creation. */
export function SkillsSettings({ cwd }: { cwd?: string }) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(() => {
    api.invoke('skills:list', cwd).then(setSkills, (e: unknown) => setError(errorMessage(e)))
  }, [cwd])
  useEffect(load, [load])

  const installFromFile = async () => {
    const [file] = await api.invoke('app:pickFiles')
    if (!file) return
    if (!/\.(skill|zip)$/i.test(file)) return setError('Choose a .skill or .zip file')
    setDialog({ kind: 'install', filePath: file })
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-base font-medium text-fg">Skills</h2>
        <p className="text-sm text-fg-muted">Reusable instructions Claude loads when a task matches their description.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setDialog({ kind: 'new' })}><Plus className="size-3.5" />New skill</Button>
        <Button onClick={() => void installFromFile()}><FileArchive className="size-3.5" />Install from file…</Button>
        <Button onClick={load}><RotateCw className="size-3.5" />Refresh</Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><X className="size-3.5" /></button>
        </div>
      )}
      {skills === null && !error && <p className="text-sm text-fg-subtle">Loading…</p>}

      {skills && GROUPS.map(({ source, title, icon: Icon }) => {
        const items = skills.filter((s) => s.source === source)
        if (!items.length) return null
        return (
          <section key={source} className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">
              <Icon className="size-3.5" />{title}<span className="text-fg-subtle">· {items.length}</span>
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
              {items.map((s) => (
                <SkillRow key={s.path} skill={s} onOpen={() => setDialog({ kind: 'edit', skill: s })} onDeleted={load} onError={setError} />
              ))}
            </ul>
          </section>
        )
      })}

      {skills?.length === 0 && <p className="text-sm text-fg-muted">No skills yet.</p>}

      <div className="rounded-xl bg-bg-sidebar px-4 py-3 text-xs text-fg-muted">
        A skill is a folder with a <code className="rounded bg-code-bg px-1 font-mono">SKILL.md</code> file (with <code className="rounded bg-code-bg px-1 font-mono">name</code> and <code className="rounded bg-code-bg px-1 font-mono">description</code> frontmatter) in{' '}
        <code className="rounded bg-code-bg px-1 font-mono">~/.claude/skills/</code> for all projects, or{' '}
        <code className="rounded bg-code-bg px-1 font-mono">.claude/skills/</code> inside a project.
      </div>

      {dialog?.kind === 'new' && <NewSkillDialog cwd={cwd} onClose={() => setDialog(null)} onCreated={load} />}
      {dialog?.kind === 'edit' && <EditSkillDialog skill={dialog.skill} onClose={() => setDialog(null)} onSaved={load} />}
      {dialog?.kind === 'install' && <InstallSkillDialog filePath={dialog.filePath} onClose={() => setDialog(null)} onInstalled={load} />}
    </div>
  )
}
