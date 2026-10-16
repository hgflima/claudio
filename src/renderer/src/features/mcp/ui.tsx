import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { McpServerStatus } from '@/lib/api'

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

export function Button({ className, variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
        variant === 'secondary' && 'border border-border bg-bg-elevated text-fg hover:bg-bg-hover',
        variant === 'ghost' && 'text-fg-muted hover:bg-bg-hover hover:text-fg',
        variant === 'danger' && 'text-danger hover:bg-danger/10',
        className
      )}
    />
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

const STATUS: Record<McpServerStatus['status'], { dot: string; label: string }> = {
  connected: { dot: 'bg-success', label: 'Connected' },
  pending: { dot: 'bg-warning animate-pulse', label: 'Connecting…' },
  failed: { dot: 'bg-danger', label: 'Failed' },
  'needs-auth': { dot: 'bg-warning', label: 'Needs authentication' },
  disabled: { dot: 'bg-fg-subtle', label: 'Disabled' }
}

export function StatusBadge({ status }: { status: McpServerStatus['status'] }) {
  const s = STATUS[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span className={cn('size-2 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

export const inputClass = 'w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent'
