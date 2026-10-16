import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Cpu, Folder, FolderOpen, MessageCircle, Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { ModelInfo, PermissionMode } from '@shared/ipc'
import { loadModels, useSessions } from '../store'
import { ConfirmDialog } from '../ui/Dialog'
import { anchorAbove, MenuItem, Popover } from '../ui/Popover'
import { basename, tildify } from '../util'

type Anchor = { x: number; y: number } | null

export function Pill({ icon, children, onClick, title, className }: { icon?: ReactNode; children: ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-7 max-w-56 items-center gap-1.5 rounded-lg px-2 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg',
        className
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  )
}

function shortModel(value: string, models: ModelInfo[] | null): string {
  if (!value) return 'Default model'
  return models?.find((m) => m.value === value)?.displayName ?? value
}

export function ModelPill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const models = useSessions((s) => s.models)
  const [anchor, setAnchor] = useState<Anchor>(null)
  return (
    <>
      <Pill
        icon={<Cpu className="size-3.5" />}
        onClick={(e) => {
          const a = anchorAbove(e.currentTarget)
          void loadModels().then(() => setAnchor(a))
        }}
      >
        {shortModel(value, models)}
        <ChevronDown className="ml-0.5 inline size-3" />
      </Pill>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="above" className="w-72">
        <MenuItem active={!value} hint={!value && <Check className="size-3.5" />} onClick={() => { setAnchor(null); onChange('') }}>
          Default
        </MenuItem>
        {(models ?? []).filter((m) => m.value !== 'default').map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => { setAnchor(null); onChange(m.value) }}
            className={cn('flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg-hover', value === m.value && 'bg-bg-hover')}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{m.displayName}</div>
              {m.description && <div className="line-clamp-2 text-xs text-fg-subtle">{m.description}</div>}
            </div>
            {value === m.value && <Check className="mt-0.5 size-3.5 shrink-0" />}
          </button>
        ))}
      </Popover>
    </>
  )
}

const MODES: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'default', label: 'Ask permissions', description: 'Ask before edits and commands' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Edit files without asking' },
  { value: 'plan', label: 'Plan mode', description: 'Explore and plan, no changes' },
  { value: 'bypassPermissions', label: 'Bypass permissions', description: 'Run everything without asking' }
]

export function modeLabel(m: PermissionMode): string {
  return MODES.find((x) => x.value === m)?.label ?? m
}

export function ModePill({ value, onChange }: { value: PermissionMode; onChange: (v: PermissionMode) => void }) {
  const [anchor, setAnchor] = useState<Anchor>(null)
  const [confirmBypass, setConfirmBypass] = useState(false)
  return (
    <>
      <Pill
        icon={<Shield className="size-3.5" />}
        className={cn(value === 'bypassPermissions' && 'text-danger', value === 'plan' && 'text-accent')}
        onClick={(e) => setAnchor(anchorAbove(e.currentTarget))}
      >
        {modeLabel(value)}
        <ChevronDown className="ml-0.5 inline size-3" />
      </Pill>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="above" className="w-64">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              setAnchor(null)
              if (m.value === 'bypassPermissions' && value !== m.value) setConfirmBypass(true)
              else onChange(m.value)
            }}
            className={cn('flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg-hover', value === m.value && 'bg-bg-hover')}
          >
            <div className="min-w-0 flex-1">
              <div className={cn(m.value === 'bypassPermissions' && 'text-danger')}>{m.label}</div>
              <div className="text-xs text-fg-subtle">{m.description}</div>
            </div>
            {value === m.value && <Check className="mt-0.5 size-3.5 shrink-0" />}
          </button>
        ))}
      </Popover>
      <ConfirmDialog
        open={confirmBypass}
        danger
        title="Run in bypass permissions mode?"
        body="Claude will run commands and edit files without asking. Only use this in a folder you fully trust, ideally sandboxed."
        confirmLabel="Bypass permissions"
        onCancel={() => setConfirmBypass(false)}
        onConfirm={() => {
          setConfirmBypass(false)
          onChange('bypassPermissions')
        }}
      />
    </>
  )
}

export function CwdPill({ cwd }: { cwd: string }) {
  return (
    <Pill icon={<Folder className="size-3.5" />} title={cwd} onClick={() => void api.invoke('app:openPath', cwd)}>
      {basename(cwd)}
    </Pill>
  )
}

export function FolderPill({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [anchor, setAnchor] = useState<Anchor>(null)
  const [recent, setRecent] = useState<string[]>([])
  const open = (el: HTMLElement) => {
    const a = anchorAbove(el)
    api
      .invoke('settings:get')
      .then((s) => setRecent(s.recentFolders))
      .catch(() => setRecent([]))
      .finally(() => setAnchor(a))
  }
  const choose = async () => {
    setAnchor(null)
    const p = await api.invoke('app:pickFolder')
    if (p) onChange(p)
  }
  return (
    <>
      <Pill
        icon={value ? <Folder className="size-3.5" /> : <MessageCircle className="size-3.5" />}
        title={value ?? 'Chat without a folder'}
        onClick={(e) => open(e.currentTarget)}
        className="text-fg"
      >
        {value ? basename(value) : 'Chat (no folder)'}
        <ChevronDown className="ml-0.5 inline size-3" />
      </Pill>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="above" className="w-80">
        {recent.length > 0 && <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-fg-subtle">Recent</div>}
        {recent.map((p) => (
          <MenuItem
            key={p}
            icon={<Folder className="size-3.5" />}
            active={p === value}
            hint={<span className="max-w-36 truncate">{tildify(p).replace(/\/[^/]+$/, '')}</span>}
            onClick={() => { setAnchor(null); onChange(p) }}
          >
            {basename(p)}
          </MenuItem>
        ))}
        {recent.length > 0 && <div className="my-1 border-t border-border" />}
        <MenuItem icon={<FolderOpen className="size-3.5" />} onClick={() => void choose()}>
          Choose folder…
        </MenuItem>
        <MenuItem icon={<MessageCircle className="size-3.5" />} active={value === null} onClick={() => { setAnchor(null); onChange(null) }}>
          Chat (no folder)
        </MenuItem>
      </Popover>
    </>
  )
}
