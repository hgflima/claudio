// Owner: agent "mcp-quick". Settings › Skills (read-only listing of SKILL.md files).
import { useEffect, useState } from 'react'
import { FolderOpen, Puzzle, RotateCw, User, FolderGit2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SkillInfo } from '@/lib/api'
import { Button, errorMessage } from './ui'

const GROUPS: { source: SkillInfo['source']; title: string; icon: typeof User }[] = [
  { source: 'user', title: 'Personal', icon: User },
  { source: 'project', title: 'Project', icon: FolderGit2 },
  { source: 'plugin', title: 'Plugins', icon: Puzzle }
]

/** `cwd` adds the project's `.claude/skills` to the listing. */
export function SkillsSettings({ cwd }: { cwd?: string }) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    api.invoke('skills:list', cwd).then(setSkills, (e: unknown) => setError(errorMessage(e)))
  }
  useEffect(load, [cwd])

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium text-fg">Skills</h2>
          <p className="text-sm text-fg-muted">Reusable instructions Claude loads when a task matches their description.</p>
        </div>
        <Button onClick={load}><RotateCw className="size-3.5" />Refresh</Button>
      </header>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
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
                <li key={s.path} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-fg">{s.name}</p>
                    {s.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted" title={s.description}>{s.description}</p>}
                  </div>
                  <Button variant="ghost" aria-label="Reveal in Finder" title={s.path} onClick={() => void api.invoke('app:showItemInFolder', s.path)}>
                    <FolderOpen className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {skills?.length === 0 && <p className="text-sm text-fg-muted">No skills found.</p>}

      <div className="rounded-xl bg-bg-sidebar px-4 py-3 text-xs text-fg-muted">
        Create a skill by adding a folder with a <code className="rounded bg-code-bg px-1 font-mono">SKILL.md</code> file (with <code className="rounded bg-code-bg px-1 font-mono">name</code> and <code className="rounded bg-code-bg px-1 font-mono">description</code> frontmatter) to{' '}
        <code className="rounded bg-code-bg px-1 font-mono">~/.claude/skills/</code> for all projects, or{' '}
        <code className="rounded bg-code-bg px-1 font-mono">.claude/skills/</code> inside a project.
      </div>
    </div>
  )
}
