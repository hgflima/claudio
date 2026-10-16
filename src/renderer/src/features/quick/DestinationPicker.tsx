import { Check, ChevronDown, Folder, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

const basename = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function DestinationButton({ value, open, onToggle }: { value: string | null; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn('flex max-w-56 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg', open && 'bg-bg-hover text-fg')}
    >
      {value ? <Folder className="size-3.5 shrink-0" /> : <MessageCircle className="size-3.5 shrink-0" />}
      <span className="truncate">{value ? basename(value) : 'Chat'}</span>
      <ChevronDown className={cn('size-3 shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
  )
}

/** Rendered in normal flow (not a popover) so the auto-sized quick window grows to fit it. */
export function DestinationMenu({ value, folders, onChange }: { value: string | null; folders: string[]; onChange: (cwd: string | null) => void }) {
  const options: { cwd: string | null; label: string; hint?: string }[] = [
    { cwd: null, label: 'Chat', hint: 'New conversation without a folder' },
    ...folders.map((f) => ({ cwd: f, label: basename(f), hint: f }))
  ]
  return (
    <div className="no-drag mx-3 mb-3 max-h-56 overflow-y-auto rounded-xl border border-border bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.cwd ?? '__chat'}
          type="button"
          onClick={() => onChange(o.cwd)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-hover"
        >
          {o.cwd ? <Folder className="size-4 shrink-0 text-fg-subtle" /> : <MessageCircle className="size-4 shrink-0 text-fg-subtle" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-fg">{o.label}</span>
            {o.hint && <span className="block truncate text-[11px] text-fg-subtle">{o.hint}</span>}
          </span>
          {o.cwd === value && <Check className="size-4 shrink-0 text-accent" />}
        </button>
      ))}
      {folders.length === 0 && <p className="px-2 py-1.5 text-xs text-fg-subtle">Folders you open in Claudio will show up here.</p>}
    </div>
  )
}
