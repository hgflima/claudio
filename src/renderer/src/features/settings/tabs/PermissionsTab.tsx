import { Folder, X } from 'lucide-react'
import type { PermissionMode, Settings } from '@/lib/api'
import { Empty, Row, Section, Select, type Option } from '../controls'

const MODES: Option<PermissionMode>[] = [
  { value: 'default', label: 'Ask for permissions' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan mode' },
  { value: 'auto', label: 'Auto' },
  { value: 'dontAsk', label: "Don't ask" },
  { value: 'bypassPermissions', label: 'Bypass permissions' }
]

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-hover hover:text-fg">
      <X size={14} />
    </button>
  )
}

export function PermissionsTab({ s, update }: { s: Settings; update: (p: Partial<Settings>) => void }) {
  const allowEntries = Object.entries(s.alwaysAllow).filter(([, rules]) => rules.length > 0)

  const removeRule = (cwd: string, rule: string): void => {
    const rules = (s.alwaysAllow[cwd] ?? []).filter((r) => r !== rule)
    const next = { ...s.alwaysAllow }
    if (rules.length) next[cwd] = rules
    else delete next[cwd]
    update({ alwaysAllow: next })
  }

  return (
    <>
      <Section title="Default mode">
        <Row label="Permission mode" hint={s.defaultPermissionMode === 'bypassPermissions' ? 'Claude will run every tool without asking.' : 'Used for new sessions'}>
          <Select label="Permission mode" value={s.defaultPermissionMode} options={MODES} onChange={(defaultPermissionMode) => update({ defaultPermissionMode })} />
        </Row>
      </Section>

      <Section title="Trusted folders" description="Folders where Claude Code can work without the trust prompt.">
        {s.trustedFolders.length === 0 && <Empty>No trusted folders yet.</Empty>}
        {s.trustedFolders.map((f) => (
          <div key={f} className="flex items-center gap-2 px-4 py-2.5">
            <Folder size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg" title={f}>{f}</span>
            <RemoveButton label="Remove folder" onClick={() => update({ trustedFolders: s.trustedFolders.filter((x) => x !== f) })} />
          </div>
        ))}
      </Section>

      <Section title="Always allowed" description="Tool rules you approved with “Always allow”, per folder.">
        {allowEntries.length === 0 && <Empty>No rules yet.</Empty>}
        {allowEntries.map(([cwd, rules]) => (
          <div key={cwd} className="px-4 py-3">
            <div className="mb-2 truncate font-mono text-[12px] text-fg-muted" title={cwd}>{cwd}</div>
            <div className="flex flex-wrap gap-1.5">
              {rules.map((r) => (
                <span key={r} className="flex items-center gap-1 rounded-md bg-code-bg py-0.5 pr-0.5 pl-2 font-mono text-[12px] text-fg">
                  {r}
                  <RemoveButton label={`Remove ${r}`} onClick={() => removeRule(cwd, r)} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </>
  )
}
